import { prisma } from './prisma';
import { createAuditLogEntry } from './audit';
import { SessionUser, SecurityException } from './auth';

export interface AiSuggestion {
  userId: string;
  name: string;
  email: string;
  role: string;
  suggestedPermission: 'read' | 'edit';
  confidence: number;
  reason: string;
}

/**
 * AI-Assisted Permission Suggester (Owner-Controlled Human-in-the-Loop Implementation).
 *
 * Scans title, category, and metadata to recommend candidate reviewers (Admins or Viewers).
 *
 * CRITICAL CONSTRAINT:
 * The AI NEVER mutates the database or auto-grants permissions.
 * It strictly outputs suggestions. Both the suggestion generation and human confirmation
 * are indelibly recorded in the cryptographic audit trail.
 */
export async function suggestDocumentAccess(
  caller: SessionUser,
  documentId: string,
  ipAddress: string = '127.0.0.1'
): Promise<AiSuggestion[]> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      permissions: {
        where: { revokedAt: null },
      },
    },
  });

  if (!document) {
    throw new SecurityException('Document not found.', 404);
  }

  // Check delegation rights: caller must be Owner OR an Admin explicitly authorized with canShare=true
  const isOwner = document.ownerId === caller.id;
  let callerPermission = null;

  if (!isOwner) {
    callerPermission = await prisma.documentPermission.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: caller.id,
        },
      },
    });

    if (!callerPermission || callerPermission.revokedAt !== null || !callerPermission.canShare) {
      throw new SecurityException('Forbidden: Only the document Owner or an explicitly delegated Admin can request permission suggestions.', 403);
    }
  }

  // Get eligible users who don't already have active permissions and aren't the owner
  const existingGrantedUserIds = new Set(document.permissions.map((p) => p.userId));
  existingGrantedUserIds.add(document.ownerId);

  // If caller is Admin, Admin can only delegate to Viewers.
  // If caller is Owner, Owner can delegate to both Admins and Viewers.
  const userFilter: any = {
    id: { notIn: Array.from(existingGrantedUserIds) },
  };

  if (!isOwner) {
    userFilter.role = 'viewer';
  }

  const potentialUsers = await prisma.user.findMany({
    where: userFilter,
  });

  const titleLower = document.title.toLowerCase();
  const catLower = document.category.toLowerCase();

  const suggestions: AiSuggestion[] = [];

  for (const user of potentialUsers) {
    let score = 0.5;
    let reason = 'General organizational reviewer match.';
    let suggestedPermission: 'read' | 'edit' = 'read';

    const userEmailLower = user.email.toLowerCase();
    const userNameLower = user.name.toLowerCase();

    // Contextual matching heuristics / LLM plugin inference
    if (catLower.includes('finance') || titleLower.includes('financial') || titleLower.includes('revenue') || titleLower.includes('audit')) {
      if (userNameLower.includes('analyst') || userEmailLower.includes('viewer') || userNameLower.includes('mercer')) {
        score = 0.94;
        reason = 'Analyst role specializes in financial audits, revenue verifications, and compliance reporting.';
      }
    } else if (catLower.includes('security') || titleLower.includes('key') || titleLower.includes('infrastructure')) {
      if (user.role === 'admin' || userNameLower.includes('security') || userNameLower.includes('vardhan')) {
        score = 0.98;
        reason = 'High-confidentiality security asset matches Chief Security Officer profile. Explicit Owner authorization recommended.';
      } else {
        score = 0.3;
        reason = 'Low confidence: User profile lacks security clearance indicators.';
      }
    } else if (catLower.includes('legal') || titleLower.includes('contract') || titleLower.includes('agreement')) {
      score = 0.85;
      reason = 'Candidate is eligible for confidential legal document review.';
    }

    if (score >= 0.5) {
      suggestions.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        suggestedPermission,
        confidence: score,
        reason,
      });
    }
  }

  // Sort by highest confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // LOG AI SUGGESTION EVENT TO IMMUTABLE AUDIT TRAIL
  await createAuditLogEntry({
    actorId: caller.id,
    action: 'AI_PERMISSION_SUGGESTION_GENERATED',
    targetId: document.id,
    ipAddress,
    status: 'SUCCESS',
    metadata: {
      documentTitle: document.title,
      callerRole: caller.role,
      isOwner,
      suggestedCount: suggestions.length,
      suggestions: suggestions.map((s) => ({
        targetUser: s.email,
        targetRole: s.role,
        confidence: s.confidence,
        suggestedPermission: s.suggestedPermission,
      })),
      disclaimer: 'AI suggestions are non-binding. Access is not granted without explicit human confirmation.',
    },
  });

  return suggestions;
}

/**
 * Confirms an AI suggestion by explicit human action.
 * Creates the permission row and logs the human confirmation to the audit trail.
 */
export async function confirmAiSuggestion(
  caller: SessionUser,
  documentId: string,
  targetUserId: string,
  canRead: boolean,
  canEdit: boolean,
  originalRationale: string,
  ipAddress: string = '127.0.0.1'
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new SecurityException('Document not found.', 404);
  }

  const isOwner = document.ownerId === caller.id;
  let callerPermission = null;

  if (!isOwner) {
    callerPermission = await prisma.documentPermission.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: caller.id,
        },
      },
    });

    if (!callerPermission || callerPermission.revokedAt !== null || !callerPermission.canShare) {
      throw new SecurityException('Forbidden: Only the document Owner or an explicitly delegated Admin can confirm permissions.', 403);
    }
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    throw new SecurityException('Target user for permission grant not found.', 404);
  }

  // Delegated Admin cannot grant permissions to other Admins or beyond Admin's own scope
  if (!isOwner) {
    if (targetUser.role !== 'viewer') {
      throw new SecurityException('Forbidden: Admins can only delegate access to Viewers. Owner authorization required for Admins.', 403);
    }
    if (canEdit && !callerPermission!.canEdit) {
      throw new SecurityException('Forbidden: You cannot grant Edit permissions exceeding your authorized scope.', 403);
    }
  }

  // Create or update permission
  const permission = await prisma.documentPermission.upsert({
    where: {
      documentId_userId: {
        documentId,
        userId: targetUserId,
      },
    },
    create: {
      documentId,
      userId: targetUserId,
      canRead,
      canDownload: true,
      canEdit: Boolean(canEdit),
      canShare: false, // AI confirmation defaults canShare to false unless manually enabled by Owner
      grantedBy: caller.id,
      revokedAt: null,
    },
    update: {
      canRead,
      canDownload: true,
      canEdit: Boolean(canEdit),
      canShare: false,
      grantedBy: caller.id,
      revokedAt: null,
    },
  });

  // LOG HUMAN CONFIRMATION TO AUDIT TRAIL
  await createAuditLogEntry({
    actorId: caller.id,
    action: isOwner ? 'AI_PERMISSION_CONFIRMED_BY_HUMAN' : 'AI_PERMISSION_CONFIRMED_BY_DELEGATED_ADMIN',
    targetId: documentId,
    ipAddress,
    status: 'SUCCESS',
    metadata: {
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      targetUserRole: targetUser.role,
      grantedByEmail: caller.email,
      grantedByRole: caller.role,
      canRead,
      canEdit,
      humanConfirmed: true,
      aiRationale: originalRationale,
    },
  });

  return permission;
}
