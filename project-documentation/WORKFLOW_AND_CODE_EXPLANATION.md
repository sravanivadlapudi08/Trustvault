# TrustVault: Complete Application Workflows & Code-Level Explanations

## 1. End-to-End Application Workflows

Here is the step-by-step technical execution flow of TrustVault, from user sign-in to document download, permission delegation, and cryptographic audit verification.

### 1.1 Complete Architecture Workflow Diagram

```
User (Browser)
   │
   ▼
Frontend (Next.js 14 React UI)
   │ [HTTPS Fetch with HttpOnly Cookie]
   ▼
Backend Route Handlers (/api/*)
   │
   ├──▶ 1. Authentication Check (jose JWT session verification)
   │       └── If invalid: 401 Unauthorized
   │
   ├──▶ 2. Authorization Guard (verifyDocumentAccess in guards.ts)
   │       ├── Live DB lookup in prisma.documentPermission
   │       └── If unauthorized: 403 Forbidden + log UNAUTHORIZED_ACCESS_BLOCKED
   │
   ├──▶ 3. Storage Layer (StorageDriver in storage.ts)
   │       ├── Private Cloud Storage (Cloudflare R2 / AWS S3) OR Local Vault
   │       └── Issue 60-second timed Presigned URL or HMAC stream token
   │
   └──▶ 4. Cryptographic Audit Engine (createAuditLogEntry in audit.ts)
           ├── Sequential Promise write queue + monotonic timestamps
           ├── Compute SHA-256 hash linked to previousHash
           └── Append immutable record to AuditLog table
```

---

### 1.2 Step-by-Step Functional Workflows

#### Workflow 1: User Sign-In & Session Issuance
1. The user navigates to `/login`.
2. The user submits their email and password (or clicks one of the preset switcher buttons: `admin`, `owner`, `viewer`, or `unauthorized`).
3. The client sends a `POST` request to `/api/auth/login`.
4. The backend queries `prisma.user.findUnique({ where: { email } })`.
5. The backend validates the password using `bcrypt.compare(password, user.passwordHash)`.
6. If valid:
   * A JWT is created using `jose.SignJWT` signed with `HS256` containing `{ id, email, name, role }` and an 8-hour lifetime.
   * The token is attached to an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `trustvault_session`.
   * A successful login audit record (`AUTH_LOGIN_SUCCESS`) is appended to the audit chain.
   * The browser redirects to `/dashboard`.
7. If invalid:
   * An `AUTH_LOGIN_FAILURE` record is written to the audit chain, and a `401 Unauthorized` status is returned with an error message.

---

#### Workflow 2: Document Ingestion & Binary Magic Byte Sniffing
1. A Document Owner clicks **"Upload Document"** on `/dashboard`.
2. The client opens `UploadModal.tsx`, pre-validating that the file is under 10MB and has an allowed extension.
3. The form is submitted as multi-part `FormData` to `POST /api/documents/upload`.
4. The server inspects the session user to ensure `role === 'owner'` or `role === 'admin'`.
5. The server reads the file into a Node.js `Buffer` and calls `validateFileMagicBytes(buffer, file.name, file.type)`:
   * Checks the first 8 bytes for authentic magic headers (`%PDF-`, `\x89PNG`, `\xFF\xD8\xFF`, `50 4B 03 04`).
   * Rejects disguised executables (e.g., Windows PE `.exe` headers starting with `4d 5a`).
6. The file is saved using a non-deterministic UUID filename (`doc_${crypto.randomUUID()}.${ext}`) via `storageDriver.saveFile()`.
7. A new database record is created in `prisma.document`.
8. An immutable audit record with action `DOCUMENT_UPLOAD` is committed to the cryptographic ledger.

---

#### Workflow 3: Owner-Controlled Permission Delegation & Admin `canShare`
1. The Owner opens the **Access Management Modal** on their document.
2. The Owner selects a user from the organization directory and chooses permission flags (`canRead`, `canDownload`, `canEdit`, `canShare`).
3. The client sends `POST /api/documents/[id]/permissions`:
   * The backend verifies the actor is the document Owner.
   * The backend upserts the `DocumentPermission` row.
   * If the Owner grants an Admin `canShare: true`, that specific Admin is now authorized to delegate Viewer permissions for that document.
4. An audit record `PERMISSION_GRANT` is appended to the hash chain.

---

#### Workflow 4: Secure Document Viewing
1. A permitted user clicks the **"View"** (eye icon) button on a document.
2. The client opens `DocumentViewModal.tsx` and triggers `POST /api/documents/[id]/view`.
3. The server runs `verifyDocumentAccess(user, docId, 'read')` against the live database.
4. The server records a `DOCUMENT_VIEW` event into the audit trail with the viewer's ID, role, and timestamp.
5. The modal displays the verified document metadata, category, and file size.

---

#### Workflow 5: Two-Phase Secure Download & Ephemeral URLs
1. **Phase 1 (URL Generation):**
   * The user clicks **Download**.
   * The client calls `GET /api/documents/[id]/download`.
   * The server runs `verifyDocumentAccess(user, docId, 'download')`.
   * If authorized, the storage driver creates an S3 presigned URL or an HMAC-signed streaming URL valid for **max 60 seconds**.
   * The server records `DOCUMENT_DOWNLOAD_INITIATED` into the audit trail.
   * The frontend starts a live 60-second visual countdown timer.
2. **Phase 2 (File Delivery):**
   * The browser follows the URL to stream the file.
   * The stream endpoint (`/api/documents/stream`) validates the HMAC signature and confirms `Date.now() <= expiresAt`.
   * **Crucial Step:** The stream endpoint re-queries the database via `verifyDocumentAccess()` at the exact millisecond of download to ensure the permission was not revoked in the intervening seconds.
   * The server streams the raw bytes with security headers (`no-store`, `nosniff`, `DENY`).
   * The server records `DOCUMENT_STREAM_COMPLETED` in the audit ledger.

---

#### Workflow 6: Instant Zero-Delay Permission Revocation
1. An Owner clicks **"Instant Revoke"** on an active permission row.
2. The client sends `DELETE /api/documents/[id]/permissions?userId=<targetId>`.
3. The backend executes `prisma.documentPermission.deleteMany()`, removing the row from the database.
4. The backend writes `PERMISSION_REVOKE` to the cryptographic audit trail.
5. The very next download or view attempt by that user (even 10 milliseconds later) fails the live database lookup, triggers an `UNAUTHORIZED_ACCESS_BLOCKED` audit alarm, and returns `403 Forbidden`.

---

#### Workflow 7: Cryptographic Chain Verification
1. An Owner or Admin opens the **Compliance** tab and clicks **"Verify Cryptographic Chain"**.
2. The client sends `POST /api/audit/verify`.
3. The backend loads all audit entries sorted by timestamp:
   * Sets `expectedPreviousHash = GENESIS_HASH` (`00000000...`).
   * Iterates through every record, recalculating $\text{SHA-256}(\text{record data} \parallel \text{expectedPreviousHash})$.
   * If calculated hash $\neq$ stored `currentHash`, the loop halts and reports the exact record ID and index of corruption.
4. The frontend renders the green immutable ledger status banner or alerts of database tampering.

---

## 2. Code-Level Deep Dive & Key Files

### 2.1 The Zero-Leak Authorization Guard ([`src/lib/guards.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/lib/guards.ts))

The central enforcement engine of TrustVault:

```typescript
export async function verifyDocumentAccess(
  actor: GuardActor,
  documentId: string,
  action: DocumentAction = 'read',
  ipAddress: string = '127.0.0.1'
) {
  // Line 29: Retrieve document from the database
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });

  // Line 39: If document doesn't exist, log probe and throw 404
  if (!document) {
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'DOCUMENT_NOT_FOUND_ACCESS_ATTEMPT',
      targetId: documentId,
      ipAddress,
      status: 'BLOCKED',
      metadata: { attemptedAction: action, actorRole: actor.role },
    });
    throw new SecurityException('Document not found.', 404);
  }

  // Line 53: Document Owner has full access to their own files
  if (document.ownerId === actor.id) {
    return { authorized: true, document, isOwner: true, permission: null };
  }

  // Line 58: Deletion is strictly reserved for the owner
  if (action === 'delete') {
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      targetId: document.id,
      ipAddress,
      status: 'BLOCKED',
      metadata: { securityAlert: 'DOCUMENT_DELETION_DENIED_NON_OWNER' },
    });
    throw new SecurityException('Access Denied (403 Forbidden): Only the document owner can delete this document.', 403);
  }

  // Line 80: Delegation Check: Both Admins and Viewers MUST have an explicit DocumentPermission row
  const permission = await prisma.documentPermission.findUnique({
    where: { documentId_userId: { documentId: document.id, userId: actor.id } },
  });

  const isActive = permission !== null && permission.revokedAt === null;
  let isAuthorized = false;

  if (isActive) {
    if (action === 'read' && permission.canRead) isAuthorized = true;
    else if (action === 'download' && (permission.canDownload ?? permission.canRead)) isAuthorized = true;
    else if (action === 'edit' && permission.canEdit) isAuthorized = true;
    else if ((action === 'manage_permissions' || action === 'share') && permission.canShare) isAuthorized = true;
  }

  // Line 106: Zero-Trust Enforcement: If unauthorized, record security violation & block
  if (!isAuthorized) {
    await createAuditLogEntry({
      actorId: actor.id,
      action: 'UNAUTHORIZED_ACCESS_BLOCKED',
      targetId: document.id,
      ipAddress,
      status: 'BLOCKED',
      metadata: {
        securityAlert: 'OWNER_CONTROLLED_ZERO_TRUST_VIOLATION',
        documentTitle: document.title,
        attemptedAction: action,
        actorRole: actor.role,
        hasPermissionRow: !!permission,
      },
    });

    throw new SecurityException('Access Denied (403 Forbidden): Zero-Leak security boundary enforced.', 403);
  }

  return { authorized: true, document, isOwner: false, permission };
}
```

* **Why this code matters:**
  * Lines 39-49 and Lines 106-135 guarantee that **every unauthorized attempt is trapped and logged into the cryptographic ledger** before returning a generic 403 error.
  * Line 80 proves that **neither Admins nor Viewers can bypass the permission table**.

---

### 2.2 The Cryptographic Audit Engine ([`src/lib/audit.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/lib/audit.ts))

Guarantees thread-safe sequential hash chaining:

```typescript
// Line 25: Sequential Promise write queue to prevent race conditions during concurrent writes
let writeQueue: Promise<any> = Promise.resolve();
let lastMonotonicTimestampMs = 0;

export async function createAuditLogEntry(params: CreateAuditLogParams) {
  return new Promise<any>((resolve, reject) => {
    writeQueue = writeQueue
      .catch(() => {}) // Prevent a previous failure from breaking future writes
      .then(async () => {
        // Line 42: Find the latest log to link previousHash
        const latestLog = await prisma.auditLog.findFirst({
          orderBy: { timestamp: 'desc' },
        });

        const previousHash = latestLog ? latestLog.currentHash : GENESIS_HASH;

        // Line 49: Strictly monotonic timestamps ensure deterministic ordering
        let now = Date.now();
        if (latestLog && latestLog.timestamp.getTime() >= now) now = latestLog.timestamp.getTime() + 10;
        if (now <= lastMonotonicTimestampMs) now = lastMonotonicTimestampMs + 10;
        lastMonotonicTimestampMs = now;
        const timestamp = new Date(now);

        const id = crypto.randomUUID();

        // Line 61: Compute deterministic SHA-256 hash
        const currentHash = computeAuditHash({
          id,
          actorId: params.actorId,
          action: params.action,
          targetId: params.targetId,
          ipAddress: params.ipAddress || '127.0.0.1',
          status: params.status,
          timestamp,
          previousHash,
        });

        // Line 72: Commit to database
        const created = await prisma.auditLog.create({
          data: {
            id,
            actorId: params.actorId,
            action: params.action,
            targetId: params.targetId,
            ipAddress: params.ipAddress || '127.0.0.1',
            status: params.status,
            metadata: params.metadata ? JSON.stringify(params.metadata) : null,
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
```

* **Why this code matters:**
  * Lines 25-37 serialize concurrent requests in Node's event loop so two simultaneous actions cannot link to the same previous hash.
  * Lines 49-57 guarantee that every timestamp is strictly greater than the preceding one.

---

### 2.3 Binary Magic Byte Sniffer ([`src/lib/crypto.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/lib/crypto.ts))

Inspects raw binary buffers to defeat polyglots and executable masquerading:

```typescript
export function validateFileMagicBytes(
  buffer: Buffer,
  filename: string,
  reportedMime: string
): { isValid: boolean; detectedMime: string; error?: string } {
  // Line 57: Strict 10MB ceiling
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { isValid: false, detectedMime: 'unknown', error: 'File size exceeds 10MB limit.' };
  }

  const ext = ('.' + filename.split('.').pop()?.toLowerCase()) || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { isValid: false, detectedMime: 'unknown', error: `File extension "${ext}" is not permitted.` };
  }

  // Line 75: Sniff magic bytes from file header
  const headerHex = buffer.subarray(0, 8).toString('hex').toLowerCase();

  // 1. PDF: starts with %PDF- (25 50 44 46)
  if (headerHex.startsWith('25504446')) {
    if (ext !== '.pdf') return { isValid: false, detectedMime: 'application/pdf', error: 'Signature is PDF but extension mismatched.' };
    return { isValid: true, detectedMime: 'application/pdf' };
  }

  // 2. PNG: starts with 89 50 4e 47 0d 0a 1a 0a
  if (headerHex.startsWith('89504e470d0a1a0a')) {
    if (ext !== '.png') return { isValid: false, detectedMime: 'image/png', error: 'Signature is PNG but extension mismatched.' };
    return { isValid: true, detectedMime: 'image/png' };
  }

  // 3. JPEG: starts with ff d8 ff
  if (headerHex.startsWith('ffd8ff')) {
    if (ext !== '.jpg' && ext !== '.jpeg') return { isValid: false, detectedMime: 'image/jpeg', error: 'Signature is JPEG but extension mismatched.' };
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // 4. DOCX/XLSX: starts with 50 4b 03 04 (PK zip header)
  if (headerHex.startsWith('504b0304') || headerHex.startsWith('504b0506')) {
    if (ext !== '.docx' && ext !== '.xlsx') return { isValid: false, detectedMime: 'application/zip', error: 'Archive signature found for non-office doc.' };
    return { isValid: true, detectedMime: ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  // 5. Plaintext & CSV: verify absence of binary null bytes
  if (ext === '.txt' || ext === '.csv') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return { isValid: false, detectedMime: 'application/octet-stream', error: 'Binary executable content detected in text file.' };
    }
    return { isValid: true, detectedMime: ext === '.csv' ? 'text/csv' : 'text/plain' };
  }

  return { isValid: false, detectedMime: 'unknown', error: 'Unrecognized file format.' };
}
```

* **Why this code matters:**
  * Disguised `.exe` files uploaded as `.pdf` or `.png` are immediately blocked at the server ingress.
