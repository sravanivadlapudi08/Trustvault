import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { suggestDocumentAccess, confirmAiSuggestion } from '../src/lib/ai';

describe('TrustVault AI Suggestion Safety Constraints (Safe Human-in-the-Loop)', () => {
  let ownerUser: any;
  let viewerUser: any;
  let doc: any;

  beforeAll(async () => {
    ownerUser = await prisma.user.findUnique({
      where: { email: 'owner@trustvault.internal' },
    });
    viewerUser = await prisma.user.findUnique({
      where: { email: 'viewer@trustvault.internal' },
    });

    doc = await prisma.document.create({
      data: {
        title: 'Quarterly Revenue Auditing & Tax Assessment',
        category: 'Finance',
        filePath: 'doc_tax_test.pdf',
        fileSize: 500,
        mimeType: 'application/pdf',
        ownerId: ownerUser.id,
      },
    });
  });

  afterAll(async () => {
    if (doc) {
      await prisma.documentPermission.deleteMany({ where: { documentId: doc.id } });
      await prisma.document.delete({ where: { id: doc.id } });
    }
  });

  it('SAFETY CONSTRAINT: AI suggestion alone NEVER auto-grants permissions or creates database rows', async () => {
    // 1. Initial permissions count is 0
    const initialPerms = await prisma.documentPermission.count({
      where: { documentId: doc.id },
    });
    expect(initialPerms).toBe(0);

    // 2. Generate suggestions
    const suggestions = await suggestDocumentAccess(
      { id: ownerUser.id, role: 'owner', email: ownerUser.email, name: ownerUser.name },
      doc.id
    );

    // 3. Suggestions returned
    expect(suggestions.length).toBeGreaterThan(0);
    const viewerMatch = suggestions.find((s) => s.email === viewerUser.email);
    expect(viewerMatch).toBeDefined();
    expect(viewerMatch?.confidence).toBeGreaterThan(0.8);

    // 4. VERIFY CONSTRAINT: Zero rows were created in DocumentPermission
    const postPerms = await prisma.documentPermission.count({
      where: { documentId: doc.id },
    });
    expect(postPerms).toBe(0);

    // 5. Verify suggestion generation was logged in the immutable audit trail
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        targetId: doc.id,
        action: 'AI_PERMISSION_SUGGESTION_GENERATED',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.status).toBe('SUCCESS');
  });

  it('Explicit human confirmation creates permission and records dual audit log', async () => {
    // Human owner explicitly confirms and grants permission based on AI recommendation
    const permission = await confirmAiSuggestion(
      { id: ownerUser.id, role: 'owner', email: ownerUser.email, name: ownerUser.name },
      doc.id,
      viewerUser.id,
      true,
      false,
      'Confirmed: Analyst role matches quarterly financial tax assessment.'
    );

    expect(permission).toBeDefined();
    expect(permission.canRead).toBe(true);
    expect(permission.canEdit).toBe(false);

    // Verify DB permission exists
    const dbPerm = await prisma.documentPermission.findUnique({
      where: {
        documentId_userId: {
          documentId: doc.id,
          userId: viewerUser.id,
        },
      },
    });
    expect(dbPerm).toBeDefined();
    expect(dbPerm?.canRead).toBe(true);

    // Verify human confirmation is logged in audit trail
    const auditConfirm = await prisma.auditLog.findFirst({
      where: {
        targetId: doc.id,
        action: 'AI_PERMISSION_CONFIRMED_BY_HUMAN',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(auditConfirm).toBeDefined();
    expect(auditConfirm?.status).toBe('SUCCESS');
    expect(auditConfirm?.metadata).toContain('Confirmed: Analyst role matches');
  });
});
