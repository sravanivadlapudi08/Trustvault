# TrustVault: Testing Suite & Technical Limitations

## 1. Automated Test Suite Verification

TrustVault features an automated security test harness built on **Vitest 2.1.3**. All tests execute against real SQLite database instances and real cryptographic hashing functions.

### 1.1 Test Execution Summary

```
Test Files:  6 passed (6)
Tests:       36 passed (36)
Duration:    3.74s
Status:      100% Passing (0 failures, 0 flaky tests)
```

| Test Suite File | Test Count | Key Scenarios Covered |
| :--- | :--- | :--- |
| [`tests/owner-audit-reports.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/owner-audit-reports.test.ts) | **10 Tests** | Owner-scoped audit logs, multi-tenant isolation (Owner A cannot see Owner B's logs), viewing audit records, compliance reporting scoping. |
| [`tests/authorization-boundaries.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/authorization-boundaries.test.ts) | **9 Tests** | Rule One (IDOR block 403), Rule Two (Instant Revocation), Owner deletion exclusivity, unauthenticated download rejection. |
| [`tests/admin-delegation-flow.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/admin-delegation-flow.test.ts) | **7 Tests** | Admin lacks authority without Owner `canShare`, Owner granting `canShare` enables delegation, Admin cannot authorize other Admins, instant revocation of Admin delegation. |
| [`tests/file-validation-magic-bytes.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/file-validation-magic-bytes.test.ts) | **6 Tests** | Magic byte sniffing for PDF, PNG, JPEG, OpenXML; polyglot PE `.exe` rejection; 10MB ceiling; text file null-byte detection. |
| [`tests/audit-tamper-chain.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/audit-tamper-chain.test.ts) | **2 Tests** | Genesis block integrity, mathematical tamper detection (modifying row data breaks chain and flags exact corrupted row ID). |
| [`tests/ai-safety-constraint.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/ai-safety-constraint.test.ts) | **2 Tests** | Zero AI write authority (suggestions perform 0 database mutations), human confirmation required to create permissions. |

---

### 1.2 Deep-Dive into Key Test Assertions

#### 1. IDOR Probe Trapping & Incident Logging
From [`tests/authorization-boundaries.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/authorization-boundaries.test.ts#L49-L80):
* An unauthorized viewer attempts to access a classified document owned by another user.
* **Assertions:**
  1. Throws `SecurityException` with HTTP status `403`.
  2. Directly queries `prisma.auditLog` to verify that an entry with `action: 'UNAUTHORIZED_ACCESS_BLOCKED'` and `status: 'BLOCKED'` was immediately created with the attacker's actor ID.

#### 2. Instant Revocation Latency (Zero Zombie Window)
From [`tests/authorization-boundaries.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/authorization-boundaries.test.ts#L82-L125):
* A permitted viewer is granted read access $\to$ Access succeeds.
* The owner calls `DELETE /api/documents/[id]/permissions` $\to$ Permission deleted.
* Milliseconds later, the viewer attempts to download the file again.
* **Assertions:**
  1. Subsequent download immediately throws `403 Forbidden`.
  2. A new `UNAUTHORIZED_ACCESS_BLOCKED` audit row is written to the ledger.

#### 3. Cryptographic Chain Tamper Detection
From [`tests/audit-tamper-chain.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/audit-tamper-chain.test.ts):
* The test creates a series of valid chained audit records.
* It simulates an attacker compromising the database and directly altering a past row's metadata via `prisma.auditLog.update()`.
* It calls `verifyAuditTrailIntegrity()`.
* **Assertions:**
  1. `isValid` returns `false`.
  2. `corruptedRecordId` matches the exact altered row UUID.
  3. `reason` reports: `"Hash mismatch at record index N"`.

#### 4. Disguised Executable (Polyglot) Rejection
From [`tests/file-validation-magic-bytes.test.ts`](file:///c:/Users/chinnari/Desktop/snovasys/tests/file-validation-magic-bytes.test.ts):
* A malicious Windows PE executable (starting with `4d 5a 90 00` - `MZ` header) is renamed to `invoice.pdf`.
* **Assertions:**
  1. `validateFileMagicBytes()` returns `isValid: false`.
  2. Detected MIME is reported as `unknown` or rejection reason: `"Unrecognized or disguised file format"`.

---

## 2. Manual Test Procedures for Mentors & Evaluators

The application includes an instant **Role-Switcher** in the navigation header to perform manual testing:

### Scenario A: Testing IDOR Prevention
1. In the top bar, click **"Unauthorized"** (logs in as `unauthorized@trustvault.internal`).
2. The dashboard shows the **Zero-Leak Boundary Enforced** screen with 0 accessible documents.
3. Click the red button **"Test IDOR Probe"**.
4. The system attempts an unauthorized access, immediately halts, and alerts:
   > *"Security Guard Response: Server blocked unauthorized IDOR access attempt... Incident recorded to cryptographic audit chain!"*
5. Switch to **"Admin"** and visit the **Audit & Compliance Center** to view the newly logged `UNAUTHORIZED_ACCESS_BLOCKED` event.

### Scenario B: Testing Instant Permission Revocation
1. Sign in as **"Owner"** (`owner@trustvault.internal`).
2. Locate the document *"Q3 Financial Audit & Revenue Projections"*.
3. Click **"Access"** to open the Zero-Leak Permission Modal.
4. Click **"Instant Revoke"** next to `viewer@trustvault.internal`.
5. In the top bar, switch to **"Viewer"**.
6. The document disappears from the dashboard immediately. Any direct URL attempt returns `403 Forbidden`.

### Scenario C: Testing Mathematical Hash Chain Verification
1. Sign in as **"Admin"** (`admin@trustvault.internal`) or as **"Owner"** (`owner@trustvault.internal`).
2. Navigate to the **Compliance** tab.
3. Click **"Verify Cryptographic Chain"**.
4. The system calculates every SHA-256 hash from the Genesis block to head, rendering the **Cryptographic Chain Integrity Verified (100% IMMUTABLE)** green banner.

---

## 3. Technical Limitations & Honest Boundaries

To present this project with academic and technical integrity, the following limitations should be acknowledged:

1. **In-Process Mutex Queue is Single-Node Only:**
   * *Current Behavior:* Cryptographic writes are serialized using an in-process Promise mutex (`src/lib/audit.ts`) to prevent concurrency race conditions.
   * *Limitation:* If TrustVault is deployed across multiple container instances (e.g., in a multi-pod Kubernetes cluster), each pod would have its own memory queue, potentially creating competing branches in the hash chain.
   * *Future Fix:* Use a distributed locking mechanism (e.g., Redis Redlock) or PostgreSQL's `pg_advisory_lock()` for multi-server serialization.

2. **Storage Encryption at Rest in Local Mode:**
   * *Current Behavior:* In local development mode (`LocalStorageDriver`), files are stored in `vault_storage/` in their original binary format, relying on OS-level folder permissions and filesystem encryption (e.g., BitLocker).
   * *Future Fix:* Implement envelope encryption using AES-256-GCM before saving file buffers to disk.

3. **Client-Side Hardware Exfiltration:**
   * *Current Behavior:* Once a permitted user downloads a document to their local device, TrustVault cannot control whether that user copies the file to a USB drive.
   * *Mitigation:* Mitigated in corporate environments using Mobile Device Management (MDM), short 60-second download windows, and complete audit logging of every download.

4. **Database Engine Differences (SQLite vs. PostgreSQL RLS):**
   * *Current Behavior:* Development and testing run on SQLite for zero-configuration setup.
   * *Limitation:* Native Row-Level Security policies and SQL triggers (`prevent_audit_log_modification`) are written for PostgreSQL (`prisma/rls_policies.sql`) and require a live PostgreSQL instance.

5. **Rate Limiting:**
   * *Current Behavior:* Endpoints perform basic IP inspection.
   * *Limitation:* Dedicated sliding-window rate limiters (e.g., Redis-backed Upstash) are not currently configured for login brute-force mitigation.
