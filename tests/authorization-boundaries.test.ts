import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { verifyDocumentAccess } from '../src/lib/guards';
import { SecurityException } from '../src/lib/auth';

describe('TrustVault Owner-Controlled Access Management (Strict Zero-Trust)', () => {
  let ownerUser: any;
  let adminUser: any;
  let permittedViewer: any;
  let unauthorizedViewer: any;
  let testDocument: any;

  beforeAll(async () => {
    // Look up seeded test accounts
    ownerUser = await prisma.user.findUnique({
      where: { email: 'owner@trustvault.internal' },
    });
    adminUser = await prisma.user.findUnique({
      where: { email: 'admin@trustvault.internal' },
    });
    permittedViewer = await prisma.user.findUnique({
      where: { email: 'viewer@trustvault.internal' },
    });
    unauthorizedViewer = await prisma.user.findUnique({
      where: { email: 'unauthorized@trustvault.internal' },
    });

    // Create a dedicated confidential test document owned by Sravani Vadlapudi (Owner)
    testDocument = await prisma.document.create({
      data: {
        title: 'Project Zero-Trust Architecture Blueprint',
        filePath: 'doc_zero_trust_test.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        category: 'Engineering',
        ownerId: ownerUser.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup test artifacts
    if (testDocument) {
      await prisma.documentPermission.deleteMany({
        where: { documentId: testDocument.id },
      });
      await prisma.document.delete({
        where: { id: testDocument.id },
      });
    }
  });

  // --------------------------------------------------------------------------
  // 1. ADMIN REQUIRES EXPLICIT OWNER APPROVAL (NO ROLE BYPASS)
  // --------------------------------------------------------------------------
  it('CRITICAL: An Admin CANNOT access a document before Owner authorization (403 Forbidden)', async () => {
    // Admin (Vardhan Vadlapudi) has role='admin', but Owner has not granted any permission for testDocument
    let caughtError: any = null;

    try {
      await verifyDocumentAccess(
        { id: adminUser.id, role: 'admin', email: adminUser.email },
        testDocument.id,
        'read',
        '10.0.0.55'
      );
    } catch (err) {
      caughtError = err;
    }

    // 1. Verify strict 403 Forbidden is thrown
    expect(caughtError).toBeInstanceOf(SecurityException);
    expect(caughtError.statusCode).toBe(403);
    expect(caughtError.message).toContain('Admin');
    expect(caughtError.message).toContain('lacks explicit Owner authorization');

    // 2. Verify violation was recorded in audit trail
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        targetId: testDocument.id,
        actorId: adminUser.id,
        action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(auditLog).toBeDefined();
    expect(auditLog?.status).toBe('BLOCKED');
    expect(auditLog?.ipAddress).toBe('10.0.0.55');
  });

  it('An Admin CANNOT download a document before Owner authorization', async () => {
    let caughtError: any = null;

    try {
      await verifyDocumentAccess(
        { id: adminUser.id, role: 'admin', email: adminUser.email },
        testDocument.id,
        'download'
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(SecurityException);
    expect(caughtError.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 2. ADMIN READ-ONLY vs DELEGATION PERMISSIONS
  // --------------------------------------------------------------------------
  it('An Admin with read-only permission CAN read but CANNOT manage or share permissions', async () => {
    // Owner authorizes Admin for read-only (canShare = false)
    await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: false, // NO DELEGATION
        grantedBy: ownerUser.id,
      },
    });

    // 1. Admin CAN now read
    const readResult = await verifyDocumentAccess(
      { id: adminUser.id, role: 'admin', email: adminUser.email },
      testDocument.id,
      'read'
    );
    expect(readResult.authorized).toBe(true);

    // 2. Admin CANNOT share/manage permissions without explicit canShare permission
    let shareError: any = null;
    try {
      await verifyDocumentAccess(
        { id: adminUser.id, role: 'admin', email: adminUser.email },
        testDocument.id,
        'manage_permissions'
      );
    } catch (err) {
      shareError = err;
    }

    expect(shareError).toBeInstanceOf(SecurityException);
    expect(shareError.statusCode).toBe(403);

    // Clean up permission for subsequent tests
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: adminUser.id },
    });
  });

  it('An Admin with explicit delegation permission (canShare=true) CAN manage Viewer permissions', async () => {
    // Owner authorizes Admin with delegation rights
    await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true, // EXPLICIT DELEGATION ALLOWED
        grantedBy: ownerUser.id,
      },
    });

    const manageResult = await verifyDocumentAccess(
      { id: adminUser.id, role: 'admin', email: adminUser.email },
      testDocument.id,
      'manage_permissions'
    );

    expect(manageResult.authorized).toBe(true);
    expect(manageResult.permission?.canShare).toBe(true);

    // Clean up
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: adminUser.id },
    });
  });

  // --------------------------------------------------------------------------
  // 3. OWNER GRANTS & REVOKES ADMIN AND VIEWER ACCESS (INSTANT REVOCATION)
  // --------------------------------------------------------------------------
  it('Owner can grant Admin access and revoking it immediately invalidates access', async () => {
    // 1. Owner grants Admin access
    const perm = await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    const activeCheck = await verifyDocumentAccess(
      { id: adminUser.id, role: 'admin', email: adminUser.email },
      testDocument.id,
      'read'
    );
    expect(activeCheck.authorized).toBe(true);

    // 2. Owner revokes Admin's permission (setting revokedAt timestamp)
    await prisma.documentPermission.update({
      where: { id: perm.id },
      data: { revokedAt: new Date() },
    });

    // 3. Immediate check must fail with 403 Forbidden
    let revokedError: any = null;
    try {
      await verifyDocumentAccess(
        { id: adminUser.id, role: 'admin', email: adminUser.email },
        testDocument.id,
        'read'
      );
    } catch (err) {
      revokedError = err;
    }

    expect(revokedError).toBeInstanceOf(SecurityException);
    expect(revokedError.statusCode).toBe(403);

    // Clean up
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: adminUser.id },
    });
  });

  // --------------------------------------------------------------------------
  // 4. VIEWER ACCESS & IDOR PREVENTION
  // --------------------------------------------------------------------------
  it('Blocks unauthorized viewer from accessing document via IDOR manipulation (403 Forbidden)', async () => {
    let caughtError: any = null;

    try {
      await verifyDocumentAccess(
        { id: unauthorizedViewer.id, role: 'viewer', email: unauthorizedViewer.email },
        testDocument.id,
        'read',
        '203.0.113.42'
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(SecurityException);
    expect(caughtError.statusCode).toBe(403);
    expect(caughtError.message).toContain('Access Denied');
  });

  it('Allows viewer access when explicit permission is granted by asset owner', async () => {
    await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: permittedViewer.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        grantedBy: ownerUser.id,
      },
    });

    const result = await verifyDocumentAccess(
      { id: permittedViewer.id, role: 'viewer', email: permittedViewer.email },
      testDocument.id,
      'read'
    );

    expect(result.authorized).toBe(true);
    expect(result.document.id).toBe(testDocument.id);

    // Clean up
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: permittedViewer.id },
    });
  });

  it('Blocks viewer from attempting unauthorized edits when granted read-only', async () => {
    await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: permittedViewer.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        grantedBy: ownerUser.id,
      },
    });

    let editError: any = null;
    try {
      await verifyDocumentAccess(
        { id: permittedViewer.id, role: 'viewer', email: permittedViewer.email },
        testDocument.id,
        'edit'
      );
    } catch (err) {
      editError = err;
    }

    expect(editError).toBeInstanceOf(SecurityException);
    expect(editError.statusCode).toBe(403);

    // Clean up
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: permittedViewer.id },
    });
  });

  it('Non-owner cannot delete a document under any circumstances', async () => {
    // Even an authorized Admin with edit/share permissions CANNOT delete an Owner document
    await prisma.documentPermission.create({
      data: {
        documentId: testDocument.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: true,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    let deleteError: any = null;
    try {
      await verifyDocumentAccess(
        { id: adminUser.id, role: 'admin', email: adminUser.email },
        testDocument.id,
        'delete'
      );
    } catch (err) {
      deleteError = err;
    }

    expect(deleteError).toBeInstanceOf(SecurityException);
    expect(deleteError.statusCode).toBe(403);
    expect(deleteError.message).toContain('Only the document owner can delete this document');

    // Clean up
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDocument.id, userId: adminUser.id },
    });
  });
});
