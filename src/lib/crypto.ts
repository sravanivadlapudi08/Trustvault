import crypto from 'crypto';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditHashPayload {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  ipAddress: string;
  status: string;
  timestamp: Date | string;
  previousHash: string;
}

/**
 * Computes deterministic SHA-256 hash for an audit log entry in the cryptographic chain.
 */
export function computeAuditHash(payload: AuditHashPayload): string {
  const timestampStr =
    payload.timestamp instanceof Date
      ? payload.timestamp.toISOString()
      : new Date(payload.timestamp).toISOString();

  const serialized = [
    payload.id,
    payload.actorId,
    payload.action,
    payload.targetId,
    payload.ipAddress,
    payload.status,
    timestampStr,
    payload.previousHash,
  ].join('|');

  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Supported MIME types and allowed extensions
 */
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.txt', '.csv'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

/**
 * Validates file magic bytes against reported MIME type and extension to prevent polyglot attacks.
 */
export function validateFileMagicBytes(
  buffer: Buffer,
  filename: string,
  reportedMime: string
): { isValid: boolean; detectedMime: string; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, detectedMime: 'unknown', error: 'File is empty (0 bytes).' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      detectedMime: 'unknown',
      error: `File size exceeds 10MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const ext = ('.' + filename.split('.').pop()?.toLowerCase()) || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      detectedMime: 'unknown',
      error: `File extension "${ext}" is not permitted. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  // Sniff magic numbers from file header
  const headerHex = buffer.subarray(0, 8).toString('hex').toLowerCase();

  // 1. PDF: starts with %PDF- (25504446)
  if (headerHex.startsWith('25504446')) {
    if (ext !== '.pdf') {
      return { isValid: false, detectedMime: 'application/pdf', error: 'File signature is PDF but extension is mismatched.' };
    }
    return { isValid: true, detectedMime: 'application/pdf' };
  }

  // 2. PNG: starts with 89504e470d0a1a0a
  if (headerHex.startsWith('89504e470d0a1a0a')) {
    if (ext !== '.png') {
      return { isValid: false, detectedMime: 'image/png', error: 'File signature is PNG but extension is mismatched.' };
    }
    return { isValid: true, detectedMime: 'image/png' };
  }

  // 3. JPEG: starts with ffd8ff
  if (headerHex.startsWith('ffd8ff')) {
    if (ext !== '.jpg' && ext !== '.jpeg') {
      return { isValid: false, detectedMime: 'image/jpeg', error: 'File signature is JPEG but extension is mismatched.' };
    }
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // 4. ZIP / DOCX / XLSX (Office Open XML): starts with 504b0304 or 504b0506 or 504b0708
  if (headerHex.startsWith('504b0304') || headerHex.startsWith('504b0506')) {
    if (ext !== '.docx' && ext !== '.xlsx') {
      return { isValid: false, detectedMime: 'application/zip', error: 'Archive signature found for non-office document.' };
    }
    const detected = ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return { isValid: true, detectedMime: detected };
  }

  // 5. Plaintext & CSV: verify UTF-8 or printable ASCII characters
  if (ext === '.txt' || ext === '.csv') {
    // Check if buffer contains null bytes or binary control sequences
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    let isBinary = false;
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      // Allow newline, tab, carriage return, and printable range (32 - 126), plus UTF-8 high bytes (> 127)
      if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32)) {
        isBinary = true;
        break;
      }
    }

    if (isBinary) {
      return {
        isValid: false,
        detectedMime: 'application/octet-stream',
        error: 'Binary executable/control content detected inside text/csv file.',
      };
    }

    return { isValid: true, detectedMime: ext === '.csv' ? 'text/csv' : 'text/plain' };
  }

  return {
    isValid: false,
    detectedMime: 'unknown',
    error: 'Unrecognized or disguised file format.',
  };
}

/**
 * Generates an HMAC-signed token for local secure streaming URLs (Rule Three).
 * Token expires in max 60 seconds.
 */
export function generateStreamToken(documentId: string, userId: string, secret: string, expiresInSeconds: number = 60): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${documentId}:${userId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = Buffer.from(`${payload}:${hmac}`).toString('base64url');
  return { token, expiresAt };
}

/**
 * Validates the stream token generated for secure download proxy.
 */
export function verifyStreamToken(token: string, secret: string): { isValid: boolean; documentId?: string; userId?: string; error?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 4) {
      return { isValid: false, error: 'Malformed stream authorization token.' };
    }

    const [documentId, userId, expiresAtStr, providedHmac] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now > expiresAt) {
      return { isValid: false, error: 'Download authorization token has expired (max 60 seconds exceeded).' };
    }

    const expectedPayload = `${documentId}:${userId}:${expiresAt}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    const hmacMatch = crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
    if (!hmacMatch) {
      return { isValid: false, error: 'Invalid token signature. Access denied.' };
    }

    return { isValid: true, documentId, userId };
  } catch (err: any) {
    return { isValid: false, error: 'Token verification failed: ' + err.message };
  }
}
