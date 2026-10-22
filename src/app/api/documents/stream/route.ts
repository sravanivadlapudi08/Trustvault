import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStreamToken } from '@/lib/crypto';
import { verifyDocumentAccess } from '@/lib/guards';
import { getStorageDriver } from '@/lib/storage';
import { createAuditLogEntry } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const { searchParams } = new URL(req.url);

  const docId = searchParams.get('docId');
  const token = searchParams.get('token');
  const requestedFilename = searchParams.get('filename');

  if (!docId || !token) {
    return new NextResponse('Bad Request: Missing docId or authorization token.', { status: 400 });
  }

  const jwtSecret = process.env.JWT_SECRET || 'trustvault-secret-key-storage-fallback-32chars';

  // 1. Verify cryptographic token signature and 60-second expiration
  const tokenResult = verifyStreamToken(token, jwtSecret);
  if (!tokenResult.isValid || !tokenResult.userId || tokenResult.documentId !== docId) {
    await createAuditLogEntry({
      actorId: tokenResult.userId || 'UNKNOWN_OR_EXPIRED',
      action: 'STREAM_TOKEN_VERIFICATION_FAILED',
      targetId: docId,
      ipAddress: ip,
      status: 'BLOCKED',
      metadata: { error: tokenResult.error || 'Token mismatch or expiration' },
    });

    return new NextResponse(
      JSON.stringify({ error: tokenResult.error || 'Invalid or expired stream authorization token.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Fetch acting user
  const user = await prisma.user.findUnique({
    where: { id: tokenResult.userId },
  });

  if (!user) {
    return new NextResponse('User not found.', { status: 403 });
  }

  try {
    // 3. IMMEDIATE REVOCATION ENFORCEMENT (Rule Two)
    // Even with a valid token, we re-verify live database authorization at the exact millisecond of download!
    const { document } = await verifyDocumentAccess(
      { id: user.id, role: user.role as any, email: user.email },
      docId,
      'download',
      ip
    );

    // 4. Retrieve private file buffer
    const storageDriver = getStorageDriver();
    const fileBuffer = (await storageDriver.getFileStream(document.filePath)) as Buffer;

    // Log successful stream delivery in audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: 'DOCUMENT_STREAM_COMPLETED',
      targetId: document.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        title: document.title,
        fileSize: fileBuffer.length,
        mimeType: document.mimeType,
      },
    });

    const filename = requestedFilename || document.title;
    const safeFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({ error: error.message }),
      { status: error.statusCode || 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
