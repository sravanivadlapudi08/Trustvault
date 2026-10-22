import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SecurityException } from '@/lib/auth';
import { verifyDocumentAccess } from '@/lib/guards';
import { createAuditLogEntry } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Zero-Leak Authorization check: verifies live DB permissions
    const { document, isOwner } = await verifyDocumentAccess(user, params.id, 'read', ip);

    // Record document view event in immutable audit trail with accurate timestamp
    await createAuditLogEntry({
      actorId: user.id,
      action: 'DOCUMENT_VIEW',
      targetId: document.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        title: document.title,
        category: document.category,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        viewerRole: user.role,
        isOwner,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        ownerId: document.ownerId,
        owner: (document as any).owner,
        createdAt: document.createdAt,
      },
      viewedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error instanceof SecurityException) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: 'Error viewing document: ' + error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return POST(req, { params });
}
