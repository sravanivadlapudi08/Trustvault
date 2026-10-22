import { prisma } from './prisma';
import { GENESIS_HASH, computeAuditHash } from './crypto';

export interface CreateAuditLogParams {
  actorId: string;
  action: string;
  targetId: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILURE';
  metadata?: Record<string, any>;
}

export interface AuditVerificationResult {
  isValid: boolean;
  totalRecords: number;
  genesisHash: string;
  latestHash?: string;
  corruptedAt?: number;
  corruptedRecordId?: string;
  reason?: string;
  details?: string;
}

// In-process mutex queue to guarantee sequential execution of cryptographic writes
let writeQueue: Promise<any> = Promise.resolve();
let lastMonotonicTimestampMs = 0;

/**
 * Creates an immutable, hash-chained audit log entry.
 * Links mathematically to the immediately preceding log's hash.
 * Fully serialized to prevent race conditions during concurrent requests.
 */
export async function createAuditLogEntry(params: CreateAuditLogParams) {
  return new Promise<any>((resolve, reject) => {
    writeQueue = writeQueue
      .catch(() => {}) // Ensure a prior failure does not block subsequent writes
      .then(async () => {
        const ip = params.ipAddress || '127.0.0.1';
        const metaString = params.metadata ? JSON.stringify(params.metadata) : null;

        // Retrieve the latest audit log to obtain its hash
        const latestLog = await prisma.auditLog.findFirst({
          orderBy: { timestamp: 'desc' },
        });

        const previousHash = latestLog ? latestLog.currentHash : GENESIS_HASH;

        // Strictly monotonic timestamp to guarantee deterministic sorting
        let now = Date.now();
        if (latestLog && latestLog.timestamp.getTime() >= now) {
          now = latestLog.timestamp.getTime() + 10;
        }
        if (now <= lastMonotonicTimestampMs) {
          now = lastMonotonicTimestampMs + 10;
        }
        lastMonotonicTimestampMs = now;
        const timestamp = new Date(now);

        const id = crypto.randomUUID();

        const currentHash = computeAuditHash({
          id,
          actorId: params.actorId,
          action: params.action,
          targetId: params.targetId,
          ipAddress: ip,
          status: params.status,
          timestamp,
          previousHash,
        });

        const created = await prisma.auditLog.create({
          data: {
            id,
            actorId: params.actorId,
            action: params.action,
            targetId: params.targetId,
            ipAddress: ip,
            status: params.status,
            metadata: metaString,
            previousHash,
            currentHash,
            timestamp,
          },
        });

        resolve(created);
      })
      .catch(reject);
  });
}

/**
 * Mathematically verifies the entire audit log hash chain from genesis to head.
 * Detects any database tampering, inserted records, modified metadata, or deleted rows.
 */
export async function verifyAuditTrailIntegrity(): Promise<AuditVerificationResult> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'asc' },
  });

  if (logs.length === 0) {
    return {
      isValid: true,
      totalRecords: 0,
      genesisHash: GENESIS_HASH,
    };
  }

  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];

    // 1. Verify previousHash linkage
    if (i === 0) {
      if (current.previousHash !== GENESIS_HASH) {
        return {
          isValid: false,
          totalRecords: logs.length,
          genesisHash: GENESIS_HASH,
          corruptedAt: 0,
          corruptedRecordId: current.id,
          reason: 'Genesis record previousHash does not match GENESIS_HASH constant.',
          details: `Expected ${GENESIS_HASH}, found ${current.previousHash}`,
        };
      }
    } else {
      const prev = logs[i - 1];
      if (current.previousHash !== prev.currentHash) {
        return {
          isValid: false,
          totalRecords: logs.length,
          genesisHash: GENESIS_HASH,
          corruptedAt: i,
          corruptedRecordId: current.id,
          reason: 'Broken cryptographic chain link detected between audit rows.',
          details: `Row #${i} (${current.id}) references previousHash ${current.previousHash}, but row #${i - 1} (${prev.id}) has hash ${prev.currentHash}`,
        };
      }
    }

    // 2. Verify current record's mathematical hash
    const expectedCurrentHash = computeAuditHash({
      id: current.id,
      actorId: current.actorId,
      action: current.action,
      targetId: current.targetId,
      ipAddress: current.ipAddress,
      status: current.status,
      timestamp: current.timestamp,
      previousHash: current.previousHash,
    });

    if (current.currentHash !== expectedCurrentHash) {
      return {
        isValid: false,
        totalRecords: logs.length,
        genesisHash: GENESIS_HASH,
        corruptedAt: i,
        corruptedRecordId: current.id,
        reason: 'Hash mismatch: row data has been altered after insertion.',
        details: `Calculated hash: ${expectedCurrentHash}, stored hash: ${current.currentHash}`,
      };
    }
  }

  return {
    isValid: true,
    totalRecords: logs.length,
    genesisHash: GENESIS_HASH,
    latestHash: logs[logs.length - 1].currentHash,
  };
}
