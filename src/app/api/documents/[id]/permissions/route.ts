import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser, SessionUser } from '@/lib/auth';
import { createAuditLogEntry } from '@/lib/audit';

interface AuthCheckSuccess {
  authorized: true;
  isOwner: boolean;
  delegatingPermission: {
    canRead: boolean;
    canDownload: boolean;
    canEdit: boolean;
    canShare: boolean;
  } | null;
  document: {
    id: string;
    title: string;
    ownerId: string;
  };
}

interface AuthCheckFailure {
  authorized: false;
  error: string;
  status: number;
}

type AuthCheckResult = AuthCheckSuccess | AuthCheckFailure;

/**
 * Validates permission management authority:
 * 1. The Owner has full management authority.
 * 2. An Admin has delegation authority ONLY if explicitly granted `canShare: true` by the Owner.
 * 3. Admins without explicit `canShare` and all unauthorized actors are strictly rejected (403).
 */
async function verifyPermissionManagementAuth(
  documentId: string,
  user: SessionUser,
  ip: string = '127.0.0.1'
): Promise<AuthCheckResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, ownerId: true },
  });

  if (!document) {
    return { authorized: false, error: 'Document not found', status: 404 };
  }

  // 1. Document Owner has ultimate authority
  if (document.ownerId === user.id) {
    return { authorized: true, isOwner: true, delegatingPermission: null, document };
  }

  // 2. Non-owner (e.g. Admin): Check if explicitly granted delegation rights (canShare=true)
  const permission = await prisma.documentPermission.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId: user.id,
      },
    },
  });

  if (permission && permission.revokedAt === null && permission.canShare) {
    return {
      authorized: true,
      isOwner: false,
      delegatingPermission: permission,
      document,
    };
  }

  // Log unauthorized permission management attempt
  await createAuditLogEntry({
    actorId: user.id,
    action: 'UNAUTHORIZED_ACCESS_BLOCKED',
    targetId: documentId,
    ipAddress: ip,
    status: 'BLOCKED',
    metadata: {
      securityAlert: 'UNAUTHORIZED_PERMISSION_MANAGEMENT_ATTEMPT',
      attemptedRole: user.role,
      hasPermissionRecord: !!permission,
      canShare: permission?.canShare ?? false,
      isRevoked: permission ? permission.revokedAt !== null : false,
      reason: 'User lacks explicit delegation/sharing authorization from document Owner.',
    },
  });

  return {
    authorized: false,
    error: 'Access Denied (403 Forbidden): Only the document Owner or an explicitly authorized Admin with delegation permissions can manage access.',
    status: 403,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const authCheck = await verifyPermissionManagementAuth(params.id, user);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const permissions = await prisma.documentPermission.findMany({
      where: {
        documentId: params.id,
        revokedAt: null,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      permissions,
      isOwner: authCheck.isOwner,
      canShare: authCheck.isOwner ? true : authCheck.delegatingPermission?.canShare,
      delegatingScope: authCheck.delegatingPermission,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching permissions: ' + error.message },
      { status: 500 }
    );
  }
}

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

    const authCheck = await verifyPermissionManagementAuth(params.id, user, ip);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const body = await req.json();
    const {
      userId,
      canRead = true,
      canDownload = true,
      canEdit = false,
      canShare = false,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required to grant permission.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user does not exist.' }, { status: 404 });
    }

    if (targetUser.id === authCheck.document.ownerId) {
      return NextResponse.json({ error: 'Target user is already the Owner of this document.' }, { status: 400 });
    }

    // Delegation Scope Enforcement for Admin:
    if (!authCheck.isOwner) {
      const adminScope = authCheck.delegatingPermission!;

      // 1. Admin cannot authorize themselves
      if (targetUser.id === user.id) {
        return NextResponse.json(
          { error: 'Forbidden: Admins cannot grant or alter their own permissions.' },
          { status: 403 }
        );
      }

      // 2. Admin can ONLY grant permissions to Viewers
      if (targetUser.role !== 'viewer') {
        return NextResponse.json(
          { error: 'Forbidden: Admins can only delegate document access to Viewers. Only the Owner can authorize Admins.' },
          { status: 403 }
        );
      }

      // 3. Admin cannot grant delegation (canShare) to anyone
      if (canShare) {
        return NextResponse.json(
          { error: 'Forbidden: Only the document Owner can grant delegation/sharing rights.' },
          { status: 403 }
        );
      }

      // 4. Admin cannot grant permissions beyond their own authorized scope
      if (canEdit && !adminScope.canEdit) {
        return NextResponse.json(
          { error: 'Forbidden: You cannot grant Edit permissions exceeding your own authorized scope.' },
          { status: 403 }
        );
      }

      if (canDownload && !adminScope.canDownload) {
        return NextResponse.json(
          { error: 'Forbidden: You cannot grant Download permissions exceeding your own authorized scope.' },
          { status: 403 }
        );
      }
    }

    // Upsert permission record with active (non-revoked) status
    const permission = await prisma.documentPermission.upsert({
      where: {
        documentId_userId: {
          documentId: params.id,
          userId,
        },
      },
      create: {
        documentId: params.id,
        userId,
        canRead: Boolean(canRead),
        canDownload: Boolean(canDownload ?? canRead),
        canEdit: Boolean(canEdit),
        canShare: authCheck.isOwner ? Boolean(canShare) : false,
        grantedBy: user.id,
        revokedAt: null,
      },
      update: {
        canRead: Boolean(canRead),
        canDownload: Boolean(canDownload ?? canRead),
        canEdit: Boolean(canEdit),
        canShare: authCheck.isOwner ? Boolean(canShare) : false,
        grantedBy: user.id,
        revokedAt: null,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

    // Record permission grant in immutable audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: authCheck.isOwner ? 'PERMISSION_GRANT' : 'PERMISSION_DELEGATED_BY_ADMIN',
      targetId: params.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        grantedByUserId: user.id,
        grantedByUserRole: user.role,
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        canRead: permission.canRead,
        canDownload: permission.canDownload,
        canEdit: permission.canEdit,
        canShare: permission.canShare,
        documentTitle: authCheck.document.title,
        delegatedByAdmin: !authCheck.isOwner,
      },
    });

    return NextResponse.json({ success: true, permission });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error granting permission: ' + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const authCheck = await verifyPermissionManagementAuth(params.id, user, ip);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId query parameter is required.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }

    // Admin can ONLY revoke Viewers
    if (!authCheck.isOwner && targetUser.role !== 'viewer') {
      return NextResponse.json(
        { error: 'Forbidden: Admins can only revoke permissions for Viewers. Admin access can only be revoked by the Owner.' },
        { status: 403 }
      );
    }

    // Instant Revocation:
    // Remove the active permission record. Subsequent requests by the revoked user fail with 403 instantly!
    const deleteResult = await prisma.documentPermission.deleteMany({
      where: {
        documentId: params.id,
        userId,
      },
    });

    if (deleteResult.count === 0) {
      return NextResponse.json({ error: 'Permission not found or already revoked.' }, { status: 404 });
    }

    // Record revocation in immutable audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: authCheck.isOwner ? 'PERMISSION_REVOKE' : 'PERMISSION_REVOKED_BY_ADMIN',
      targetId: params.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: {
        revokedByUserId: user.id,
        revokedByUserRole: user.role,
        revokedUserId: userId,
        revokedEmail: targetUser.email,
        revokedRole: targetUser.role,
        documentTitle: authCheck.document.title,
        immediateEffect: 'Live authorization queries now return 403 Forbidden.',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Permission for ${targetUser.email} revoked immediately.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error revoking permission: ' + error.message },
      { status: 500 }
    );
  }
}
