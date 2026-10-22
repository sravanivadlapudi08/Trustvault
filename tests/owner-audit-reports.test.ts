import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { NextRequest } from 'next/server';
import { GET as auditGet } from '../src/app/api/audit/route';
import { POST as verifyPost } from '../src/app/api/audit/verify/route';
import { POST as viewPost } from '../src/app/api/documents/[id]/view/route';
import { GET as reportsGet } from '../src/app/api/reports/route';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';
import { createAuditLogEntry } from '../src/lib/audit';

describe('Owner Audit Logs, Compliance & Reports Suite', () => {
  let ownerUser: any;
  let secondOwnerUser: any;
  let adminUser: any;
  let viewerUser: any;
  let unauthorizedUser: any;

  let ownerToken: string;
  let secondOwnerToken: string;
  let adminToken: string;
  let viewerToken: string;
  let unauthorizedToken: string;

  let docOwnerA: any;
  let docOwnerB: any;

  beforeAll(async () => {
    // 1. Fetch existing seed users
    ownerUser = await prisma.user.findUnique({ where: { email: 'owner@trustvault.internal' } });
    adminUser = await prisma.user.findUnique({ where: { email: 'admin@trustvault.internal' } });
    viewerUser = await prisma.user.findUnique({ where: { email: 'viewer@trustvault.internal' } });
    unauthorizedUser = await prisma.user.findUnique({ where: { email: 'unauthorized@trustvault.internal' } });

    // 2. Create second owner to test tenant isolation
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Owner123!@#', 10);
    secondOwnerUser = await prisma.user.upsert({
      where: { email: 'secondowner@trustvault.internal' },
      update: {},
      create: {
        email: 'secondowner@trustvault.internal',
        name: 'Second Owner Corp',
        passwordHash: hash,
        role: 'owner',
      },
    });

    // 3. Create session tokens
    ownerToken = await createSessionToken({ id: ownerUser.id, email: ownerUser.email, name: ownerUser.name, role: 'owner' });
    secondOwnerToken = await createSessionToken({ id: secondOwnerUser.id, email: secondOwnerUser.email, name: secondOwnerUser.name, role: 'owner' });
    adminToken = await createSessionToken({ id: adminUser.id, email: adminUser.email, name: adminUser.name, role: 'admin' });
    viewerToken = await createSessionToken({ id: viewerUser.id, email: viewerUser.email, name: viewerUser.name, role: 'viewer' });
    unauthorizedToken = await createSessionToken({ id: unauthorizedUser.id, email: unauthorizedUser.email, name: unauthorizedUser.name, role: 'viewer' });

    // 4. Create document for Owner A
    docOwnerA = await prisma.document.create({
      data: {
        title: 'Confidential Audit Alpha',
        category: 'Finance',
        filePath: 'doc_alpha.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        ownerId: ownerUser.id,
      },
    });

    // 5. Create document for Owner B
    docOwnerB = await prisma.document.create({
      data: {
        title: 'Secret Patent Beta',
        category: 'Legal',
        filePath: 'doc_beta.pdf',
        fileSize: 4096,
        mimeType: 'application/pdf',
        ownerId: secondOwnerUser.id,
      },
    });

    // 6. Grant viewerUser read access to docOwnerA
    await prisma.documentPermission.create({
      data: {
        documentId: docOwnerA.id,
        userId: viewerUser.id,
        canRead: true,
        canDownload: true,
        canEdit: false,
        canShare: false,
        grantedBy: ownerUser.id,
      },
    });

    // 7. Seed sample audit logs
    await createAuditLogEntry({
      actorId: ownerUser.id,
      action: 'DOCUMENT_UPLOAD',
      targetId: docOwnerA.id,
      status: 'SUCCESS',
      metadata: { title: docOwnerA.title },
    });

    await createAuditLogEntry({
      actorId: secondOwnerUser.id,
      action: 'DOCUMENT_UPLOAD',
      targetId: docOwnerB.id,
      status: 'SUCCESS',
      metadata: { title: docOwnerB.title },
    });
  });

  afterAll(async () => {
    // Cleanup test documents and permissions
    if (docOwnerA) {
      await prisma.documentPermission.deleteMany({ where: { documentId: docOwnerA.id } });
      await prisma.document.delete({ where: { id: docOwnerA.id } }).catch(() => {});
    }
    if (docOwnerB) {
      await prisma.documentPermission.deleteMany({ where: { documentId: docOwnerB.id } });
      await prisma.document.delete({ where: { id: docOwnerB.id } }).catch(() => {});
    }
    if (secondOwnerUser) {
      await prisma.user.delete({ where: { id: secondOwnerUser.id } }).catch(() => {});
    }
  });

  function makeRequest(url: string, method: string = 'GET', token?: string, body?: any) {
    const headers = new Headers();
    if (token) {
      headers.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    }
    if (body) {
      headers.set('Content-Type', 'application/json');
    }
    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('1. Allows Owner to retrieve audit logs scoped to their own documents', async () => {
    const req = makeRequest('http://localhost:3000/api/audit', 'GET', ownerToken);
    const res = await auditGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.logs)).toBe(true);

    // Should include logs for docOwnerA or ownerUser actions
    const hasDocALog = data.logs.some((l: any) => l.targetId === docOwnerA.id);
    expect(hasDocALog).toBe(true);

    // Each log should have enriched human-readable metadata
    const docALog = data.logs.find((l: any) => l.targetId === docOwnerA.id);
    expect(docALog.documentTitle).toBe('Confidential Audit Alpha');
    expect(docALog.actorUser).toBeDefined();
  });

  it('2. Enforces Tenant Isolation: Owner A cannot view Owner B documents in audit logs', async () => {
    const req = makeRequest('http://localhost:3000/api/audit', 'GET', ownerToken);
    const res = await auditGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Must NOT contain logs targeting docOwnerB
    const hasDocBLog = data.logs.some((l: any) => l.targetId === docOwnerB.id);
    expect(hasDocBLog).toBe(false);
  });

  it('3. Denies ordinary Viewers from accessing audit logs (403 Forbidden)', async () => {
    const req = makeRequest('http://localhost:3000/api/audit', 'GET', viewerToken);
    const res = await auditGet(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toMatch(/Forbidden/i);
  });

  it('4. Allows Admin to view global audit logs', async () => {
    const req = makeRequest('http://localhost:3000/api/audit', 'GET', adminToken);
    const res = await auditGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.logs)).toBe(true);
    // Global admin can see both docOwnerA and docOwnerB records
    const hasDocA = data.logs.some((l: any) => l.targetId === docOwnerA.id);
    const hasDocB = data.logs.some((l: any) => l.targetId === docOwnerB.id);
    expect(hasDocA).toBe(true);
    expect(hasDocB).toBe(true);
  });

  it('5. Records DOCUMENT_VIEW event with accurate timestamp when authorized user views document', async () => {
    // Permitted viewer accesses document view
    const req = makeRequest(`http://localhost:3000/api/documents/${docOwnerA.id}/view`, 'POST', viewerToken);
    const res = await viewPost(req, { params: { id: docOwnerA.id } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.document.title).toBe('Confidential Audit Alpha');
    expect(data.viewedAt).toBeDefined();

    // Verify audit log entry was created for DOCUMENT_VIEW
    const viewLog = await prisma.auditLog.findFirst({
      where: {
        actorId: viewerUser.id,
        action: 'DOCUMENT_VIEW',
        targetId: docOwnerA.id,
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(viewLog).not.toBeNull();
    expect(viewLog?.status).toBe('SUCCESS');
    expect(viewLog?.currentHash).toBeDefined();
  });

  it('6. Blocks unauthorized user from viewing document and records UNAUTHORIZED_ACCESS_BLOCKED', async () => {
    const req = makeRequest(`http://localhost:3000/api/documents/${docOwnerA.id}/view`, 'POST', unauthorizedToken);
    const res = await viewPost(req, { params: { id: docOwnerA.id } });
    expect(res.status).toBe(403);

    // Verify blocked audit log was recorded
    const blockedLog = await prisma.auditLog.findFirst({
      where: {
        actorId: unauthorizedUser.id,
        action: 'UNAUTHORIZED_ACCESS_BLOCKED',
        targetId: docOwnerA.id,
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(blockedLog).not.toBeNull();
    expect(blockedLog?.status).toBe('BLOCKED');
  });

  it('7. Allows Owner to run cryptographic audit chain verification', async () => {
    const req = makeRequest('http://localhost:3000/api/audit/verify', 'POST', ownerToken);
    const res = await verifyPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verification.isValid).toBe(true);
    expect(data.verification.totalRecords).toBeGreaterThan(0);
  });

  it('8. Denies ordinary Viewers from running cryptographic verification (403 Forbidden)', async () => {
    const req = makeRequest('http://localhost:3000/api/audit/verify', 'POST', viewerToken);
    const res = await verifyPost(req);
    expect(res.status).toBe(403);
  });

  it('9. Generates real compliance reports scoped to Owner workspace', async () => {
    const req = makeRequest('http://localhost:3000/api/reports?days=30', 'GET', ownerToken);
    const res = await reportsGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.scope).toBe('owner');
    expect(data.summary.totalDocuments).toBeGreaterThanOrEqual(1);
    expect(data.summary.totalViews).toBeGreaterThanOrEqual(1);

    // Document access history includes docOwnerA
    const docHistory = data.documentAccessHistory.find((d: any) => d.documentId === docOwnerA.id);
    expect(docHistory).toBeDefined();
    expect(docHistory.title).toBe('Confidential Audit Alpha');
    expect(docHistory.views).toBeGreaterThanOrEqual(1);

    // Does NOT include docOwnerB (owned by secondOwner)
    const hasDocBHistory = data.documentAccessHistory.some((d: any) => d.documentId === docOwnerB.id);
    expect(hasDocBHistory).toBe(false);

    // User activity includes viewerUser
    const viewerActivity = data.userActivity.find((u: any) => u.userId === viewerUser.id);
    expect(viewerActivity).toBeDefined();
    expect(viewerActivity.views).toBeGreaterThanOrEqual(1);

    // Cryptographic chain verification summary is included
    expect(data.compliance.cryptographicChain.isValid).toBe(true);
  });

  it('10. Denies ordinary Viewers from accessing reports API (403 Forbidden)', async () => {
    const req = makeRequest('http://localhost:3000/api/reports', 'GET', viewerToken);
    const res = await reportsGet(req);
    expect(res.status).toBe(403);
  });
});
