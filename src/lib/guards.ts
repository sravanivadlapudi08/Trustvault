import { prisma } from './prisma';
import { UserRole, SecurityException } from './auth';
import { createAuditLogEntry } from './audit';

export type DocumentAction = 'read' | 'download' | 'edit' | 'delete' | 'manage_permissions' | 'share';

export interface GuardActor {
  id: string;
  role: UserRole;
  email?: string;
}

/**
 * The "Zero-Leak" Owner-Controlled Authorization Guard (Strict Zero-Trust).
 *
 * Enforces that:
 * 1. The Document Owner has ultimate authority over their documents.
 * 2. An Admin does NOT receive automatic access to documents simply because of the Admin role.
 *    Any Admin must have an explicit, active DocumentPermission granted by the Owner.
 * 3. An Admin can only manage/delegate Viewer permissions if granted explicit `canShare` rights.
 * 4. Revocations (either setting revokedAt or deleting the permission) invalidate access immediately.
 */
export async function verifyDocumentAccess(
  actor: GuardActor,
  documentId: string,
  action: DocumentAction = 'read',
  ipAddress: string = '127.0.0.1'
) {
  // 1. Fetch document from database
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      owner: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!document) {
    // Record lookup failure
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'DOCUMENT_NOT_FOUND_ACCESS_ATTEMPT',
      targetId: documentId,
      ipAddress,
      status: 'BLOCKED',
      metadata: { attemptedAction: action, actorRole: actor.role },
    });
    throw new SecurityException('Document not found.', 404);
  }

  // 2. Owner Access: Document owner has full rights to their own documents
  if (document.ownerId === actor.id) {
    return { authorized: true, document, isOwner: true, permission: null };
  }

  // 3. Deletion is strictly reserved for the document owner
  if (action === 'delete') {
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      targetId: document.id,
      ipAddress,
      status: 'BLOCKED',
      metadata: {
        securityAlert: 'DOCUMENT_DELETION_DENIED_NON_OWNER',
        attemptedAction: action,
        actorRole: actor.role,
      },
    });
    throw new SecurityException(
      'Access Denied (403 Forbidden): Only the document owner can delete this document.',
      403
    );
  }

  // 4. Delegation & Permission Check:
  // Both Admins and Viewers MUST have an explicit, active (non-revoked) DocumentPermission record.
  // There is NO role-based automatic bypass for Admins.
  const permission = await prisma.documentPermission.findUnique({
    where: {
      documentId_userId: {
        documentId: document.id,
        userId: actor.id,
      },
    },
  });

  const isActive = permission !== null && permission.revokedAt === null;
  let isAuthorized = false;

  if (isActive) {
    if (action === 'read' && permission.canRead) {
      isAuthorized = true;
    } else if (action === 'download' && (permission.canDownload ?? permission.canRead)) {
      isAuthorized = true;
    } else if (action === 'edit' && permission.canEdit) {
      isAuthorized = true;
    } else if ((action === 'manage_permissions' || action === 'share') && permission.canShare) {
      // Only users with explicit delegation rights (canShare=true) can manage or share permissions
      isAuthorized = true;
    }
  }

  // 5. Zero-Trust Enforcement: If unauthorized, record security violation in audit log & block!
  if (!isAuthorized) {
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      targetId: document.id,
      ipAddress,
      status: 'BLOCKED',
      metadata: {
        securityAlert: 'OWNER_CONTROLLED_ZERO_TRUST_VIOLATION',
        documentTitle: document.title,
        documentCategory: document.category,
        attemptedAction: action,
        actorRole: actor.role,
        hasPermissionRow: !!permission,
        isRevoked: permission ? permission.revokedAt !== null : false,
        canRead: permission?.canRead ?? false,
        canDownload: permission?.canDownload ?? false,
        canEdit: permission?.canEdit ?? false,
        canShare: permission?.canShare ?? false,
      },
    });

    const roleMsg = actor.role === 'admin'
      ? `Admin ${actor.id} lacks explicit Owner authorization for action '${action}' on document '${document.id}'.`
      : `Actor ${actor.id} lacks explicit '${action}' authorization on document '${document.id}'.`;

    throw new SecurityException(
      `Access Denied (403 Forbidden): ${roleMsg} This incident has been logged.`,
      403
    );
  }

  return {
    authorized: true,
    document,
    isOwner: false,
    permission,
  };
}
