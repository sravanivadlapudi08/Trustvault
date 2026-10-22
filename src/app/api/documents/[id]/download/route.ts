import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SecurityException } from '@/lib/auth';
import { verifyDocumentAccess } from '@/lib/guards';
import { getStorageDriver } from '@/lib/storage';
import { createAuditLogEntry } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser(req);
    if (!user) {
      await createAuditLogEntry({
        actorId: 'ANONYMOUS',
        action: 'UNAUTHENTICATED_DOWNLOAD_ATTEMPT',
        targetId: params.id,
        ipAddress: ip,
        status: 'BLOCKED',
        metadata: { reason: 'No active session token provided.' },
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // CRITICAL: The "Zero-Leak" Authorization Guard (Rule One)
    // Runs live database query to verify permissions.
    // Throws 403 and automatically logs UNAUTHORIZED_ACCESS_BLOCKED if not permitted.
    const { document } = await verifyDocumentAccess(user, params.id, 'download', ip);

    // Rule Three: Buckets are private. Generate short-lived presigned URL (valid for max 60 seconds)
    const storageDriver = getStorageDriver();
    const downloadUrl = await storageDriver.generatePresignedDownloadUrl(
      document.filePath,
      document.id,
      user.id,
      document.title,
      60
    );

    // Record authorized download preparation in immutable audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: 'DOCUMENT_DOWNLOAD_INITIATED',
      targetId: document.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        title: document.title,
        category: document.category,
        fileSize: document.fileSize,
        presignedExpirySeconds: 60,
      },
    });

    return NextResponse.json({
      downloadUrl,
      expiresIn: 60,
      document: {
        id: document.id,
        title: document.title,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
      },
    });
  } catch (error: any) {
    if (error instanceof SecurityException) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: 'Error generating secure download URL: ' + error.message },
      { status: 500 }
    );
  }
}
