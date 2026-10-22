import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { createAuditLogEntry, verifyAuditTrailIntegrity } from '../src/lib/audit';
import { execSync } from 'child_process';

describe('TrustVault Cryptographic Hash-Chained Audit Trail', () => {
  beforeAll(async () => {
    // Ensure audit chain starts from a healthy state before testing
    const check = await verifyAuditTrailIntegrity();
    if (!check.isValid) {
      execSync('node prisma/seed.js', { stdio: 'pipe' });
    }
  });

  it('Verifies intact cryptographic hash chain from genesis block to head', async () => {
    // Add two test audit entries to chain
    await createAuditLogEntry({
      actorId: 'test-actor-1',
      action: 'SYSTEM_TEST_PROBE',
      targetId: 'resource-alpha',
      status: 'SUCCESS',
      metadata: { probe: 1 },
    });

    await createAuditLogEntry({
      actorId: 'test-actor-2',
      action: 'SYSTEM_TEST_PROBE',
      targetId: 'resource-beta',
      status: 'SUCCESS',
      metadata: { probe: 2 },
    });

    const verification = await verifyAuditTrailIntegrity();

    expect(verification.isValid).toBe(true);
    expect(verification.totalRecords).toBeGreaterThanOrEqual(3);
    expect(verification.corruptedAt).toBeUndefined();
  });

  it('MATHEMATICAL PROOF: Detects database tampering if a row status or payload is manipulated', async () => {
    // 1. Create a legitimate entry
    const entry = await createAuditLogEntry({
      actorId: 'attacker-test',
      action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      targetId: 'classified-target',
      status: 'BLOCKED',
      metadata: { attackVector: 'idor' },
    });

    // 2. Initial state is mathematically valid
    const preCheck = await verifyAuditTrailIntegrity();
    expect(preCheck.isValid).toBe(true);

    // 3. Simulating unauthorized database tampering:
    // Malicious DBA modifies status from 'BLOCKED' to 'SUCCESS' directly in SQL table
    await prisma.auditLog.update({
      where: { id: entry.id },
      data: { status: 'SUCCESS' }, // TAMPERING!
    });

    // 4. Run cryptographic verification
    const postTamperCheck = await verifyAuditTrailIntegrity();

    // Verification MUST FAIL and pinpoint the exact modified record
    expect(postTamperCheck.isValid).toBe(false);
    expect(postTamperCheck.corruptedRecordId).toBe(entry.id);
    expect(postTamperCheck.reason).toContain('Hash mismatch: row data has been altered after insertion');

    // 5. Restore original value for cleanup
    await prisma.auditLog.update({
      where: { id: entry.id },
      data: { status: 'BLOCKED' },
    });

    const cleanCheck = await verifyAuditTrailIntegrity();
    expect(cleanCheck.isValid).toBe(true);
  });
});
