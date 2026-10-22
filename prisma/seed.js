const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function calculateAuditHash(log) {
  const payload = [
    log.id,
    log.actorId,
    log.action,
    log.targetId,
    log.ipAddress,
    log.status,
    log.timestamp.toISOString(),
    log.previousHash,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function main() {
  console.log('--- Seeding TrustVault Security Database ---');

  // 1. Clean existing records
  await prisma.auditLog.deleteMany();
  await prisma.documentPermission.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Users
  const adminPassword = await bcrypt.hash('Admin123!@#', 10);
  const ownerPassword = await bcrypt.hash('Owner123!@#', 10);
  const viewerPassword = await bcrypt.hash('Viewer123!@#', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@trustvault.internal',
      name: 'Vardhan Vadlapudi (Chief Security Officer)',
      passwordHash: adminPassword,
      role: 'admin',
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: 'owner@trustvault.internal',
      name: 'Sravani Vadlapudi (Asset Director)',
      passwordHash: ownerPassword,
      role: 'owner',
    },
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@trustvault.internal',
      name: 'Alice Mercer (Auditing Analyst)',
      passwordHash: viewerPassword,
      role: 'viewer',
    },
  });

  const unauthorizedViewer = await prisma.user.create({
    data: {
      email: 'unauthorized@trustvault.internal',
      name: 'Mallory Kane (External Contractor)',
      passwordHash: viewerPassword,
      role: 'viewer',
    },
  });

  console.log(`Created users:
  - Admin:  ${admin.email} (Role: admin)
  - Owner:  ${owner.email} (Role: owner)
  - Viewer: ${viewer.email} (Role: viewer)
  - Unauthorized: ${unauthorizedViewer.email} (Role: viewer)`);

  // 3. Ensure local storage directory exists
  const storageDir = path.resolve(process.cwd(), 'vault_storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // 4. Create sample seed documents in private storage
  const doc1Key = `doc_${crypto.randomUUID()}.pdf`;
  const doc1Path = path.join(storageDir, doc1Key);
  const samplePdfContent = Buffer.from('%PDF-1.4\n%TrustVault High-Confidential Financial Audit Q3-2026\n%%EOF');
  fs.writeFileSync(doc1Path, samplePdfContent);

  const doc2Key = `doc_${crypto.randomUUID()}.pdf`;
  const doc2Path = path.join(storageDir, doc2Key);
  const sampleDoc2Content = Buffer.from('%PDF-1.4\n%TrustVault Top-Secret Infrastructure Keys\n%%EOF');
  fs.writeFileSync(doc2Path, sampleDoc2Content);

  const doc1 = await prisma.document.create({
    data: {
      title: 'Q3 Financial Audit & Revenue Projections',
      category: 'Finance',
      filePath: doc1Key,
      fileSize: samplePdfContent.length,
      mimeType: 'application/pdf',
      ownerId: owner.id,
    },
  });

  const doc2 = await prisma.document.create({
    data: {
      title: 'Core Infrastructure Security Keys (Classified)',
      category: 'Security',
      filePath: doc2Key,
      fileSize: sampleDoc2Content.length,
      mimeType: 'application/pdf',
      ownerId: owner.id,
    },
  });

  // 5. Grant explicit permission to viewer for doc1 ONLY
  await prisma.documentPermission.create({
    data: {
      documentId: doc1.id,
      userId: viewer.id,
      canRead: true,
      canDownload: true,
      canEdit: false,
      canShare: false,
      grantedBy: owner.id,
    },
  });

  console.log(`Granted viewer (${viewer.email}) access to "${doc1.title}".`);
  console.log(`Notice: "${doc2.title}" has NO permissions granted to viewer (IDOR test candidate).`);

  // 6. Initialize Cryptographic Hash-Chained Audit Trail
  const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

  const genesisLogId = crypto.randomUUID();
  const genesisTimestamp = new Date();
  const genesisPayload = {
    id: genesisLogId,
    actorId: 'SYSTEM',
    action: 'SYSTEM_GENESIS_INITIALIZE',
    targetId: 'SYSTEM',
    ipAddress: '127.0.0.1',
    status: 'SUCCESS',
    timestamp: genesisTimestamp,
    previousHash: GENESIS_HASH,
  };
  const genesisHash = calculateAuditHash(genesisPayload);

  const log1 = await prisma.auditLog.create({
    data: {
      ...genesisPayload,
      metadata: JSON.stringify({ system: 'TrustVault v1.0', event: 'Cryptographic Audit Trail Genesis Block' }),
      currentHash: genesisHash,
    },
  });

  // Second log: doc1 upload
  const log2Id = crypto.randomUUID();
  const log2Timestamp = new Date(Date.now() + 1000);
  const log2Payload = {
    id: log2Id,
    actorId: owner.id,
    action: 'DOCUMENT_UPLOAD',
    targetId: doc1.id,
    ipAddress: '192.168.1.100',
    status: 'SUCCESS',
    timestamp: log2Timestamp,
    previousHash: log1.currentHash,
  };
  const log2Hash = calculateAuditHash(log2Payload);

  const log2 = await prisma.auditLog.create({
    data: {
      ...log2Payload,
      metadata: JSON.stringify({ title: doc1.title, category: doc1.category, size: doc1.fileSize }),
      currentHash: log2Hash,
    },
  });

  // Third log: permission granted to viewer
  const log3Id = crypto.randomUUID();
  const log3Timestamp = new Date(Date.now() + 2000);
  const log3Payload = {
    id: log3Id,
    actorId: owner.id,
    action: 'PERMISSION_GRANT',
    targetId: doc1.id,
    ipAddress: '192.168.1.100',
    status: 'SUCCESS',
    timestamp: log3Timestamp,
    previousHash: log2.currentHash,
  };
  const log3Hash = calculateAuditHash(log3Payload);

  await prisma.auditLog.create({
    data: {
      ...log3Payload,
      metadata: JSON.stringify({ targetUser: viewer.email, canRead: true, canEdit: false }),
      currentHash: log3Hash,
    },
  });

  console.log('Seeded initial tamper-evident cryptographic audit chain (3 chained blocks).');
  console.log('--- Database Seeding Complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
