# TrustVault 🛡️
### Production-Ready, Ultra-Secure Document Sharing & Auditing Platform

TrustVault is an enterprise document vault designed under a **Zero-Trust** security architecture. Security, strict server-side enforcement, and an immutable cryptographic audit trail are its core pillars.

---

## 🌟 Core Security Innovations

### 1. The "Zero-Leak" Authorization Rules (CRITICAL)
* **Rule One (Live DB Authorization):** Documents are reachable **only** by users explicitly granted access. Every single request (`GET`, `POST`, `DOWNLOAD`) executes a database-backed authorization check on the server thread. No client-side trust, no cached bypasses.
* **Rule Two (Instant Revocation):** Taking access away works immediately. When an owner revokes a permission, the database record is invalidated instantly. The very next download attempt fails with `403 Forbidden` and is audited.
* **Rule Three (Private Storage Only):** Storage buckets are completely private. Direct public URLs return `403 Forbidden`. Files are served exclusively via timed server-generated presigned URLs (valid for **max 60 seconds**) generated *only after* an authorization check passes.
* **Rule Four (Owner-Controlled Zero-Trust):** The Document Owner is the sole and ultimate authority over document access. Admins do **NOT** receive automatic access to document content or delegation privileges merely due to their `admin` role. Admins require explicit Owner authorization, and can only delegate access to Viewers if granted explicit `canShare` permissions.

### 2. Strict Owner-Controlled Admin Delegation
* **No Blanket Admin Access:** All hardcoded Admin permission bypasses are removed. Non-owners are denied access by default unless granted an active `DocumentPermission`.
* **Bounded Delegation:** An Admin granted `canShare: true` by the Owner may grant or revoke access *only* for Viewers, strictly within the permissions granted by the Owner (cannot grant `canEdit` if not held, cannot grant `canShare`, cannot authorize other Admins or themselves).
* **Instant Revocation Cascade:** Revoking an Admin's permission immediately severs their access and halts their ability to delegate.

### 2. Tamper-Evident Immutable Audit Trail (Cryptographic Hash Chain)
* Every sensitive action is logged: uploads, downloads, changes, deletions, permission grants/revokes, and **failed unauthorized attempts** (IDOR probes, bad logins).
* Each audit entry is mathematically linked to the preceding row's SHA-256 hash:
  $$\text{currentHash} = \text{SHA-256}(\text{id} \parallel \text{actorId} \parallel \text{action} \parallel \text{targetId} \parallel \text{ipAddress} \parallel \text{status} \parallel \text{timestamp} \parallel \text{previousHash})$$
* Any direct manipulation of database rows breaks the chain and is mathematically flagged in real-time by the Admin Integrity Verifier.

### 3. Server-Side Magic Byte Sniffing & MIME Validation
* File uploads are restricted to `.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`, `.csv`, `.txt` with a strict **10MB ceiling**.
* The server reads file buffer headers to detect magic bytes (e.g. `%PDF-`, `\x89PNG`, `\xFF\xD8\xFF`, `PK\x03\x04`), immediately rejecting polyglot payloads or executables disguised as documents.

### 4. AI-Assisted Safe Permission Suggester (Human-in-the-Loop)
* An AI helper analyzes document metadata and suggests eligible organizational reviewers based on category and title.
* **Strict Constraint:** The AI can **only suggest**. It has zero write authority to the database. An explicit human owner confirmation is required to create permissions, and both the suggestion and human confirmation are permanently recorded in the audit trail.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* Node.js v18+ (tested on Node.js v22.20)
* npm v10+

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize & Seed Database
TrustVault uses SQLite by default for zero-config local development and testing, with full PostgreSQL Row-Level Security readiness for production.
```bash
# Push Prisma schema to local database
npm run db:push

# Seed default roles, sample confidential documents, and genesis audit block
npm run db:seed
```

### 4. Run the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 5. Run the Automated Security Test Suite
TrustVault comes with a 100% passing automated Vitest suite verifying all authorization boundaries, IDOR prevention, and tamper detection:
```bash
npm test
```

---

## 🔑 Seed Test Accounts

TrustVault is pre-seeded with accounts for all roles. You can sign in using the login form or use the **instant one-click test switcher** in the top navigation bar:

| Role | Name | Email | Password | Clearances & Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | Vardhan Vadlapudi | `admin@trustvault.internal` | `Admin123!@#` | Global audit inspection, cryptographic chain verification. Document access requires explicit Owner authorization. |
| **`owner`** | Sravani Vadlapudi | `owner@trustvault.internal` | `Owner123!@#` | Upload documents, categorize, grant/revoke permissions for Admins and Viewers, authorize Admin delegation. |
| **`viewer`** (Permitted) | Elena Rostova | `viewer@trustvault.internal` | `Viewer123!@#` | Can view and download explicitly granted documents. |
| **`viewer`** (Unauthorized) | Marcus Vance | `unauthorized@trustvault.internal` | `Viewer123!@#` | IDOR test subject. Has 0 granted documents. Probes trigger 403 Forbidden. |

---

## 🧪 Security Verification Walkthrough

### Scenario A: Testing IDOR Prevention (Rule One)
1. Sign in as `unauthorized@trustvault.internal` (or click "Unauthorized" in the top bar).
2. The dashboard displays the **Zero-Leak Boundary Enforced** screen.
3. Click **"Test IDOR Probe"** on the dashboard.
4. The server attempts to access an unauthorized document, halts execution, returns `403 Forbidden`, and alerts:
   > *"Security Guard Response: Zero-Leak Security Boundary Verified: Server blocked unauthorized IDOR access attempt... Incident recorded to cryptographic audit chain!"*
5. Switch to `admin@trustvault.internal` and navigate to **Audit & Compliance Center** to observe the logged `UNAUTHORIZED_ACCESS_BLOCKED` event with the attacker's actor ID and IP address.

### Scenario B: Testing Immediate Revocation (Rule Two)
1. Sign in as `owner@trustvault.internal`.
2. Find the document *"Q3 Financial Audit & Revenue Projections"*.
3. Click **"Access"** to open the Zero-Leak Access Management modal.
4. Notice that `viewer@trustvault.internal` has active Read permissions.
5. Click **"Instant Revoke"**.
6. Switch to `viewer@trustvault.internal`. The document disappears from the list immediately. Any direct URL or download attempt will now return `403 Forbidden`.

### Scenario C: Testing Mathematical Audit Tamper Detection
1. Sign in as `admin@trustvault.internal`.
2. Navigate to **Audit & Compliance Center** (`/admin`).
3. Click **"Verify Cryptographic Chain"**.
4. The system calculates the SHA-256 chain from Genesis block `00000000...` to head, rendering the **Cryptographic Chain Integrity Verified (100% IMMUTABLE)** green proof banner.
5. Inspect any log row to see the exact `previousHash` $\to$ `currentHash` linkage and context metadata.

### Scenario D: Testing Strict Owner-Controlled Admin Delegation
1. Sign in as `admin@trustvault.internal` (Vardhan Vadlapudi). Notice that unauthorized documents are completely invisible on the dashboard.
2. Sign in as `owner@trustvault.internal` (Sravani Vadlapudi).
3. Open **"Access"** on a document $\to$ Under **"Authorize Admin Access"**, select Vardhan Vadlapudi, check **"Allow Admin to delegate access to Viewers (`canShare`)"**, and click **"Authorize Admin"**.
4. Switch back to `admin@trustvault.internal`. The document now appears with the badge **`ADMIN: DELEGATION AUTHORIZED`**.
5. Click **"Delegate"** $\to$ Vardhan can now grant Viewer permissions to named Viewers. Note that Vardhan cannot authorize other Admins or grant permissions exceeding his own scope.
6. Switch back to Owner $\to$ Click **"Instant Revoke"** on the Admin $\to$ Vardhan immediately loses document visibility and delegation rights (`403 Forbidden`).

---

## 📂 Project Structure

```
trustvault/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/suggest-permissions/route.ts  # Safe AI suggester & human confirmation
│   │   │   ├── audit/route.ts                   # Admin audit trail query
│   │   │   ├── audit/verify/route.ts            # Cryptographic chain verifier
│   │   │   ├── auth/login/route.ts              # Session issuance & audit logging
│   │   │   ├── auth/logout/route.ts             # Session cleanup
│   │   │   ├── auth/me/route.ts                 # Session claim inspection
│   │   │   ├── documents/route.ts               # Zero-Leak document search & listing
│   │   │   ├── documents/upload/route.ts        # Magic byte sniffing & private deposit
│   │   │   ├── documents/[id]/download/route.ts # 60s presigned URL generation
│   │   │   ├── documents/[id]/permissions/      # Instant grant/revoke API
│   │   │   ├── documents/[id]/view/route.ts     # Document inspection & view event logging
│   │   │   ├── documents/stream/route.ts        # Timed signed stream proxy (Rule Three)
│   │   │   ├── reports/route.ts                 # Real database activity & compliance reports
│   │   │   └── users/route.ts                   # Public user directory for delegations
│   │   ├── admin/page.tsx                       # Admin Audit & Compliance Center + Reports
│   │   ├── dashboard/page.tsx                   # Role-aware vault dashboard (Docs, Audit, Compliance, Reports)
│   │   ├── login/page.tsx                       # Secure sign-in portal
│   │   └── layout.tsx                           # Cyber-vault root theme
│   ├── components/
│   │   ├── Navbar.tsx                           # Brand header, role switcher & tabs navigation
│   │   ├── UploadModal.tsx                      # Client & server validated upload modal
│   │   ├── PermissionModal.tsx                  # Instant revocation & AI helper modal
│   │   └── DocumentViewModal.tsx                # Document inspector & view logging modal
│   └── lib/
│       ├── prisma.ts                            # Prisma singleton instance
│       ├── crypto.ts                            # SHA-256 hash chain, magic bytes, HMAC
│       ├── auth.ts                              # Password hashing & JWT cookies
│       ├── storage.ts                           # Cloudflare R2 / S3 / Local storage driver
│       ├── guards.ts                            # Zero-Leak verifyDocumentAccess guard
│       ├── audit.ts                             # Hash-chained audit logging engine
│       └── ai.ts                                # Human-in-the-loop AI recommendation
├── prisma/
│   ├── schema.prisma                            # SQLite development schema
│   ├── schema.postgresql.prisma                 # Production PostgreSQL schema (RLS ready)
│   ├── rls_policies.sql                         # PostgreSQL Row-Level Security policies
│   └── seed.js                                  # Seed accounts, docs & genesis block
├── tests/
│   ├── owner-audit-reports.test.ts              # Owner audit logs, compliance & tenant-isolated reports
│   ├── authorization-boundaries.test.ts         # IDOR, instant revocation & Admin isolation tests
│   ├── admin-delegation-flow.test.ts            # Owner -> Admin -> Viewer delegation API tests
│   ├── audit-tamper-chain.test.ts               # Cryptographic tamper detection tests
│   ├── file-validation-magic-bytes.test.ts      # Magic bytes & polyglot defense tests
│   └── ai-safety-constraint.test.ts             # AI human-in-the-loop tests
├── THREATS.md                                   # Comprehensive STRIDE & OWASP threat model
├── PROMPTS.md                                   # AI prompt engineering & security log
└── README.md                                    # This setup & architectural guide
```

---

## 🛡️ Production PostgreSQL & Cloudflare R2 Deployment

To deploy to PostgreSQL with Row-Level Security and Cloudflare R2:

1. Update `.env`:
   ```ini
   DATABASE_URL="postgresql://user:password@your-postgres-host:5432/trustvault?schema=public"
   STORAGE_DRIVER="s3"
   S3_BUCKET_NAME="trustvault-private-bucket"
   S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
   S3_ACCESS_KEY_ID="your-r2-access-key-id"
   S3_SECRET_ACCESS_KEY="your-r2-secret-access-key"
   ```
2. Push the PostgreSQL schema:
   ```bash
   npx prisma db push --schema=prisma/schema.postgresql.prisma
   ```
3. Apply Row-Level Security policies & immutable triggers:
   ```bash
   psql -d trustvault -f prisma/rls_policies.sql
   ```

---

## 📜 License
MIT License. Built for ultra-secure enterprise document collaboration and immutable audit compliance.
