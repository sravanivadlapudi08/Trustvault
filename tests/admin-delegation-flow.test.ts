import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { POST as permissionsPost, DELETE as permissionsDelete } from '../src/app/api/documents/[id]/permissions/route';
import { NextRequest } from 'next/server';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';

describe('Admin Delegation Workflow & Owner Authority Constraints', () => {
  let ownerUser: any;
  let adminUser: any;
  let secondAdminUser: any;
  let viewerUser: any;
  let testDoc: any;
  let adminSessionToken: string;
  let ownerSessionToken: string;

  beforeAll(async () => {
    ownerUser = await prisma.user.findUnique({
      where: { email: 'owner@trustvault.internal' },
    });
    adminUser = await prisma.user.findUnique({
      where: { email: 'admin@trustvault.internal' },
    });
    viewerUser = await prisma.user.findUnique({
      where: { email: 'viewer@trustvault.internal' },
    });

    // Create a second admin to test that an admin cannot authorize other admins
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Admin123!@#', 10);
    secondAdminUser = await prisma.user.upsert({
      where: { email: 'secondadmin@trustvault.internal' },
      update: {},
      create: {
        email: 'secondadmin@trustvault.internal',
        name: 'Second Admin',
        passwordHash: hash,
        role: 'admin',
      },
    });

    // Create test document owned by ownerUser
    testDoc = await prisma.document.create({
      data: {
        title: 'Confidential Financial Ledger Q4',
        category: 'Finance',
        filePath: 'doc_ledger_test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        ownerId: ownerUser.id,
      },
    });

    // Create session tokens
    adminSessionToken = await createSessionToken({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'admin',
    });

    ownerSessionToken = await createSessionToken({
      id: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
      role: 'owner',
    });
  });

  beforeEach(async () => {
    // Reset permissions on testDoc between test cases
    await prisma.documentPermission.deleteMany({
      where: { documentId: testDoc.id },
    });
  });

  afterAll(async () => {
    if (testDoc) {
      await prisma.documentPermission.deleteMany({ where: { documentId: testDoc.id } });
      await prisma.document.delete({ where: { id: testDoc.id } });
    }
    if (secondAdminUser) {
      await prisma.user.delete({ where: { id: secondAdminUser.id } }).catch(() => {});
    }
  });

  function createRequest(method: string, url: string, body?: any, token?: string) {
    const headers = new Headers();
    if (token) {
      headers.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    }
    headers.set('Content-Type', 'application/json');

    const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (token) {
      req.cookies.set(SESSION_COOKIE_NAME, token);
    }
    return req;
  }

  // --------------------------------------------------------------------------
  // SCENARIO A: Owner has NOT authorized Admin
  // --------------------------------------------------------------------------
  it('Scenario A: Unauthorized Admin CANNOT grant Viewer permissions via API (403 Forbidden)', async () => {
    // Admin attempts to grant access to viewerUser without Owner authorization
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true },
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Access Denied (403 Forbidden)');
    expect(data.error).toContain('delegation');
  });

  // --------------------------------------------------------------------------
  // SCENARIO B: Owner authorizes Admin
  // --------------------------------------------------------------------------
  it('Scenario B: Owner authorizes Admin with read-only (canShare=false) -> Admin still cannot delegate', async () => {
    // Owner grants read-only permission to Admin
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: false, // NO DELEGATION
        grantedBy: ownerUser.id,
      },
    });

    // Admin attempts to delegate access to Viewer
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true },
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Access Denied (403 Forbidden)');
  });

  it('Owner authorizes Admin with canShare=true -> Admin CAN delegate Viewer access within scope', async () => {
    // Owner grants Admin read + delegation (canShare = true, canEdit = false)
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false, // EDIT NOT GRANTED
        canShare: true, // DELEGATION GRANTED
        grantedBy: ownerUser.id,
      },
    });

    // Admin delegates access to Viewer
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true, canDownload: true },
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.permission.userId).toBe(viewerUser.id);
    expect(data.permission.canRead).toBe(true);

    // Verify in DB that grantedBy is adminUser.id
    const dbPerm = await prisma.documentPermission.findUnique({
      where: { documentId_userId: { documentId: testDoc.id, userId: viewerUser.id } },
    });
    expect(dbPerm).toBeDefined();
    expect(dbPerm?.grantedBy).toBe(adminUser.id);
  });

  it('Delegated Admin CANNOT grant Edit permissions exceeding their own authorized scope', async () => {
    // Owner authorizes Admin with canEdit=false, canShare=true
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    // Admin attempts to grant canEdit = true to Viewer
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true, canEdit: true }, // Exceeds Admin scope
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('cannot grant Edit permissions exceeding your own authorized scope');
  });

  it('Delegated Admin CANNOT grant access to other Admins or to themselves', async () => {
    // Owner authorizes Admin with canShare=true
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    // Admin attempts to authorize another Admin
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: secondAdminUser.id, canRead: true },
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Admins can only delegate document access to Viewers');
  });

  it('Delegated Admin CANNOT grant delegation (canShare) rights to anyone', async () => {
    // Owner authorizes Admin with canShare=true
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    // Admin attempts to grant canShare = true to Viewer
    const req = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true, canShare: true },
      adminSessionToken
    );

    const res = await permissionsPost(req, { params: { id: testDoc.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Only the document Owner can grant delegation/sharing rights');
  });

  it('Owner revoking Admin immediately terminates Admin document access and delegation rights', async () => {
    // 1. Owner authorizes Admin with canShare=true
    await prisma.documentPermission.create({
      data: {
        documentId: testDoc.id,
        userId: adminUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: true,
        grantedBy: ownerUser.id,
      },
    });

    // 2. Owner revokes Admin's authorization
    const deleteReq = createRequest(
      'DELETE',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions?userId=${adminUser.id}`,
      undefined,
      ownerSessionToken
    );

    const deleteRes = await permissionsDelete(deleteReq, { params: { id: testDoc.id } });
    expect(deleteRes.status).toBe(200);

    // 3. Admin immediately attempts to delegate to Viewer -> REJECTED (403)
    const postReq = createRequest(
      'POST',
      `http://localhost:3000/api/documents/${testDoc.id}/permissions`,
      { userId: viewerUser.id, canRead: true },
      adminSessionToken
    );

    const postRes = await permissionsPost(postReq, { params: { id: testDoc.id } });
    expect(postRes.status).toBe(403);
  });
});
