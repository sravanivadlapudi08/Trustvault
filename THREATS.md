# TrustVault Threat Model & Security Architecture (THREATS.md)

**Document Version:** 1.0.0  
**Classification:** Internal Confidential / Security Architecture  
**Author:** Principal Security Engineer & Full-Stack Architect  
**Evaluation Frameworks:** STRIDE, OWASP Top 10 (2021/2023), NIST SP 800-53  

---

## 1. Executive Summary

TrustVault is an ultra-secure, multi-tenant document sharing and cryptographic auditing platform designed under the principle of **Zero-Trust** and the **Zero-Leak Authorization Rule**. The platform ensures that documents are unreachable without explicit, active server-side authorization. Access revocations take effect immediately, files reside in private storage buckets without public direct URLs, and every access event—successful or blocked—is permanently sealed into a mathematically verifiable, SHA-256 cryptographic hash chain.

---

## 2. System Architecture & Trust Boundaries

```
[ Unauthenticated / Untrusted Zone ]
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│   Edge Reverse Proxy / Next.js HTTPS Ingress Gateway   │
│   - TLS 1.3 Termination                                │
│   - Rate Limiting & Origin Header Inspection          │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│        TrustVault Application Layer (Server-Side)      │
│   - Session Verification (HttpOnly JWT / HS256)       │
│   - RBAC Role Validation (admin / owner / viewer)     │
│   - Zero-Leak Guard (verifyDocumentAccess DB queries)  │
│   - Server-Side Magic Byte Sniffer & File Sanitizer   │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
┌────────────▼─────────────┐ ┌─────────────▼─────────────┐
│ Database Layer (PostgreSQL│ │ Private Cloud Storage     │
│ / Prisma with RLS)       │ │ (Cloudflare R2 / S3 /     │
│ - User & Document tables │ │  Local Encrypted Vault)   │
│ - Append-Only Audit Chain│ │ - NO Public URLs (403)    │
│ - No UPDATE/DELETE Trigger│ │ - Short-lived URLs (≤60s) │
└──────────────────────────┘ └───────────────────────────┘
```

---

## 3. Threat Vector Analysis & Mitigation Matrix

### 3.1 Insecure Direct Object Reference (IDOR) & Broken Object Level Authorization (BOLA)
* **Threat Classification:** OWASP A01:2021 – Broken Access Control / STRIDE: Elevation of Privilege
* **Attack Scenario:** An authenticated `viewer` (e.g., Mallory) attempts to access `GET /api/documents/<classified-uuid>/download` or requests metadata for a document owned by another user without permission.
* **Technical Mitigation (Rule One - Zero-Leak):**
  1. No client-side authorization trust. Every request (`GET`, `POST`, `DOWNLOAD`) invokes `verifyDocumentAccess(actor, documentId, action)`.
  2. The server queries the database directly on the request thread. If no matching active row exists in `DocumentPermission` (`canRead = true`), authorization is immediately denied.
  3. **Violation Trapping:** Failed attempts immediately execute `createAuditLogEntry()` with `status: 'BLOCKED'`, `action: 'UNAUTHORIZED_ACCESS_BLOCKED'`, and capture actor ID, target document ID, and client IP address.
  4. Returns `403 Forbidden` with a generic message, preventing metadata leakage.
* **Verification:** `tests/authorization-boundaries.test.ts` simulates direct IDOR manipulation, asserting a `403 Forbidden` and verifying audit log entry creation.

---

### 3.2 Permission Revocation Latency & Zombie Access
* **Threat Classification:** OWASP A07:2021 – Identification & Authentication Failures / STRIDE: Elevation of Privilege
* **Attack Scenario:** An asset owner revokes access for an external contractor. If the system caches permissions or relies on long-lived tokens, the contractor could download files during the validity window.
* **Technical Mitigation (Rule Two - Immediate Revocation):**
  1. **Zero Permission Caching:** Permissions are never cached in Redis, local memory, or JWT claims.
  2. `prisma.documentPermission.deleteMany()` removes the delegation record immediately.
  3. The very next download attempt (even milliseconds later) executes a database lookup, fails to find the record, blocks the stream, and logs the blocked violation.
  4. Presigned URLs are strictly limited to a **maximum of 60 seconds** (`expiresIn: 60`).
* **Verification:** `tests/authorization-boundaries.test.ts` executes a grant followed immediately by a revocation, confirming instantaneous `403 Forbidden` enforcement.

---

### 3.3 Direct Object Storage Leaks & Bucket Exfiltration
* **Threat Classification:** OWASP A05:2021 – Security Misconfiguration / STRIDE: Information Disclosure
* **Attack Scenario:** An attacker intercepts or guesses an S3/R2 storage key (e.g. `doc_123.pdf`) and navigates directly to the bucket endpoint `https://bucket.r2.cloudflarestorage.com/doc_123.pdf` to bypass application authorization.
* **Technical Mitigation (Rule Three - Completely Private Storage):**
  1. The Cloudflare R2 / S3 bucket has public access blocked (`BlockPublicAcls = true`, `IgnorePublicAcls = true`). Direct bucket requests return `403 Forbidden`.
  2. Storage keys are generated as non-deterministic UUIDs (`doc_${crypto.randomUUID()}.${ext}`). User-controlled filenames are never used as storage keys.
  3. Files are accessible solely via short-lived AWS S3 Presigned URLs (`@aws-sdk/s3-request-presigner`) generated with `expiresIn: 60` seconds **only after** `verifyDocumentAccess` succeeds.
  4. For local environments, the storage proxy (`/api/documents/stream`) requires an HMAC-SHA256 signed token valid for max 60 seconds and re-verifies live database authorization before streaming any bytes.

---

### 3.4 Audit Trail Tampering & Log Forgery
* **Threat Classification:** OWASP A09:2021 – Security Logging and Monitoring Failures / STRIDE: Repudiation
* **Attack Scenario:** An attacker compromises the database or an insider DBA attempts to alter or delete audit records (e.g. changing `status: 'BLOCKED'` to `'SUCCESS'` or deleting unauthorized access logs).
* **Technical Mitigation (Cryptographic Hash-Chaining & DB Immutability):**
  1. **Cryptographic Chaining:** Each row stores `previousHash` and `currentHash`:
     $$\text{currentHash} = \text{SHA-256}(\text{id} \parallel \text{actorId} \parallel \text{action} \parallel \text{targetId} \parallel \text{ipAddress} \parallel \text{status} \parallel \text{timestamp} \parallel \text{previousHash})$$
  2. **Genesis Block Anchor:** The chain begins with a genesis block linked to `0000000000000000000000000000000000000000000000000000000000000000`.
  3. **Mathematical Verification:** Any mutation of past rows (payload, status, timestamp) invalidates the hash of that row and all downstream records.
  4. **PostgreSQL Immutability Trigger:** In production PostgreSQL (`prisma/rls_policies.sql`), a `BEFORE UPDATE OR DELETE` trigger strictly forbids modifications:
     ```sql
     CREATE TRIGGER trg_prevent_audit_modification
     BEFORE UPDATE OR DELETE ON audit_logs
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
     ```
* **Verification:** `tests/audit-tamper-chain.test.ts` simulates unauthorized DB modification and asserts that `verifyAuditTrailIntegrity()` flags the exact corrupted record.

---

### 3.5 Polyglot File Uploads & Executable Masquerading
* **Threat Classification:** OWASP A03:2021 – Injection / OWASP A08:2021 – Software & Data Integrity Failures
* **Attack Scenario:** An attacker renames a malicious Windows executable or web shell (`malware.exe`) to `invoice.pdf` and uploads it.
* **Technical Mitigation:**
  1. **Extension Whitelist:** Only `.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`, `.jpeg`, `.txt`, `.csv` allowed.
  2. **Strict Magic Byte Sniffing:**
     * PDF: Must begin with `%PDF-` (`25 50 44 46`).
     * PNG: Must begin with `\x89PNG\r\n\x1a\n` (`89 50 4e 47 0d 0a 1a 0a`).
     * JPEG: Must begin with `\xFF\xD8\xFF` (`ffd8ff`).
     * Office (DOCX/XLSX): Must match OpenXML archive headers (`50 4b 03 04`).
     * Text/CSV: Inspected for null bytes (`0x00`) or binary control characters.
  3. **File Size Capping:** Strict 10MB limit enforced on raw buffer before disk or S3 persistence.
* **Verification:** `tests/file-validation-magic-bytes.test.ts` tests authentic headers vs polyglot executables.

---

### 3.6 AI Privilege Escalation & Autonomous Permission Grant
* **Threat Classification:** OWASP Top 10 for LLM (LLM06: Excessive Agency)
* **Attack Scenario:** An AI agent is manipulated by prompt injection in document metadata to grant access to an unauthorized actor.
* **Technical Mitigation (Human-in-the-Loop Constraint):**
  1. **Strict Read-Only Agency:** The AI suggester (`suggestDocumentAccess`) has **zero write permissions** to `DocumentPermission`. It can only return candidate proposals in memory.
  2. **Explicit Human Confirmation Required:** Only a human owner clicking "Confirm & Grant" triggers the database write.
  3. **Dual Audit Logging:** Both `AI_PERMISSION_SUGGESTION_GENERATED` and `AI_PERMISSION_CONFIRMED_BY_HUMAN` are recorded in the cryptographic audit trail.
* **Verification:** `tests/ai-safety-constraint.test.ts` validates that suggestions perform 0 database mutations until explicit human confirmation.

---

### 3.7 Token Hijacking & Session Security
* **Threat Classification:** OWASP A07:2021 – Identification & Authentication Failures
* **Attack Scenario:** An attacker attempts Cross-Site Scripting (XSS) to exfiltrate session tokens or intercepts tokens in transit.
* **Technical Mitigation:**
  1. Sessions are issued in `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookies, preventing JavaScript reading.
  2. Cryptographically signed using `jose` with `HS256` and minimum 256-bit entropy.
  3. 8-hour maximum lifetime; expired sessions reject immediately.

---

### 3.8 Zero-Trust Privilege Separation: Owner Authority & Admin Isolation
* **Threat Classification:** OWASP A01:2021 – Broken Access Control / STRIDE: Elevation of Privilege
* **Attack Scenario:** An infrastructure or system Administrator attempts to read private document contents or grant access to third parties without document Owner consent, relying on role-based administrative status.
* **Technical Mitigation (Strict Owner-Controlled Zero-Trust):**
  1. **Zero Blanket Admin Bypass:** All legacy `role === 'admin'` bypasses have been eradicated from the document authorization engine. The Document Owner is the sole and ultimate authority over document permissions.
  2. **Explicit Owner Authorization for Admins:** An Admin possesses zero inherent access to any document. To view, download, or delegate access to a document, the Owner must explicitly grant that specific Admin a `DocumentPermission` record. Without an active record (`revokedAt === null`), all requests result in `403 Forbidden`.
  3. **Delegation Scope Isolation (`canShare`):** An Admin can only grant or revoke Viewer permissions if the Owner explicitly granted the Admin `canShare: true`. If the Owner grants only `canRead: true`, the Admin cannot delegate.
  4. **Strict Delegation Boundaries:** Authorized Admins can **only** delegate access to `viewer` users. They are strictly prohibited from authorizing other Admins, modifying other Admins' permissions, granting permissions beyond their own scope (e.g. granting `canEdit` when the Admin lacks edit rights), or granting `canShare` to anyone.
  5. **Immediate Revocation:** If the Owner revokes the Admin's permission, the Admin's read, download, and delegation capabilities terminate immediately. Any subsequent attempt by the Admin returns `403 Forbidden` and logs a security violation.
* **Verification:** `tests/authorization-boundaries.test.ts` and `tests/admin-delegation-flow.test.ts` cover all 8 Scenarios (unapproved Admin 403, read-only Admin delegation rejection, authorized Admin delegation success, scope escalation rejection, self-authorization rejection, Admin-to-Admin rejection, and instant revocation).

---

## 4. Residual Risks & Operational Compensations

| Residual Risk | Impact | Likelihood | Compensating Control |
| :--- | :--- | :--- | :--- |
| **Client-Side Downloaded File Exfiltration** | High | Low | Once a permitted user downloads a file to their local machine, TrustVault cannot control local hardware exfiltration. Mitigated via corporate MDM, short-lived URLs, and complete audit logging of download events. |
| **Database Root Key Compromise** | Critical | Very Low | A root PostgreSQL superuser can drop tables. Mitigated by using external write-once log replication (e.g. AWS S3 Glacier / CloudWatch Logs) in production. |
| **Argon2 / Bcrypt CPU Exhaustion via Login Flooding** | Medium | Low | Mitigated by IP rate limiting on `/api/auth/login` and failed login audit alarms. |

---

## 5. Security Verification Summary

TrustVault includes a comprehensive automated security test harness (`npm test`) covering all security boundaries:
* ✅ 10 Owner Audit Logs, Compliance & Tenant-Isolated Reports tests (`tests/owner-audit-reports.test.ts`)
* ✅ 9 Authorization, Zero-Leak & Admin Isolation boundary tests (`tests/authorization-boundaries.test.ts`)
* ✅ 7 Owner $\to$ Admin $\to$ Viewer delegation workflow tests (`tests/admin-delegation-flow.test.ts`)
* ✅ 2 Cryptographic hash-chain & tamper detection tests (`tests/audit-tamper-chain.test.ts`)
* ✅ 6 Magic byte, MIME sniffing & polyglot defense tests (`tests/file-validation-magic-bytes.test.ts`)
* ✅ 2 AI safety & human-in-the-loop constraint tests (`tests/ai-safety-constraint.test.ts`)
* **Total: 36 Automated Security Unit & Integration Tests Passing (100% Green).**
