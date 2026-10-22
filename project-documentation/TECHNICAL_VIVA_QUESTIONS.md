# TrustVault: Technical Viva Questions & Answers (35+ Questions)

This document contains 35+ technically rigorous, mentor-ready viva questions and answers based on the actual TrustVault implementation.

---

## 1. Project Motivation & Conceptual Architecture

### Q1: What is the main objective of TrustVault?
**Answer:** TrustVault is an enterprise document vault designed under a **Zero-Trust security model** and the **Data Custodianship principle**. Its goal is to eliminate Insecure Direct Object References (IDOR), prevent "zombie access" caused by permission caching latency, keep files in completely private storage with 60-second timed URLs, and maintain an immutable, tamper-evident SHA-256 cryptographic audit chain.

### Q2: What does "Zero-Trust" mean in the context of TrustVault?
**Answer:** "Zero-Trust" means *never trust, always verify*. Even if a user has successfully logged in with valid session cookies, the system never assumes they are authorized to touch a file. Every single request (`GET`, `POST`, `VIEW`, `DOWNLOAD`) executes a live database query against `DocumentPermission` on the server thread before granting access.

### Q3: What is "Data Custodianship" and how does TrustVault implement it?
**Answer:** Data Custodianship means the person who created or uploaded the document (the Owner) retains exclusive sovereignty over it. An Administrator cannot read, download, delete, or delegate the document unless the Owner has explicitly granted them access or `canShare: true` rights in the database.

### Q4: How is TrustVault different from a typical file uploader?
**Answer:** 
1. Standard uploaders use predictable IDs (`/file/123.pdf`); TrustVault uses non-deterministic UUID keys and live DB authorization.
2. Standard apps have long revocation delays; TrustVault revokes access instantly in 0 milliseconds.
3. Standard uploaders expose public S3 links; TrustVault uses short-lived 60-second presigned URLs or signed HMAC streams.
4. Standard apps have modifiable SQL audit logs; TrustVault links every log entry in a mathematical SHA-256 hash chain anchored to a Genesis Block.

---

## 2. Technology Stack & Framework Choices

### Q5: Why did you choose Next.js 14 App Router instead of a separate React frontend and Express backend?
**Answer:** Next.js 14 App Router unifies React Server/Client Components with server-side Route Handlers in a single repository. This provides end-to-end TypeScript type sharing between Prisma models, backend API responses, and frontend UI components, eliminating cross-origin (CORS) configuration issues and simplifying deployment.

### Q6: Why did you choose Prisma ORM over raw SQL queries or Mongoose/MongoDB?
**Answer:** Prisma provides compile-time type safety and automated migration workflows. When schema changes occur, Prisma automatically regenerates TypeScript types. For relational data with strict foreign keys and cascading deletes (e.g., deleting a document must cascade delete its permissions), relational SQL via Prisma is far superior to NoSQL document stores.

### Q7: Why is SQLite used for development and what is the production database plan?
**Answer:** SQLite is a serverless, zero-config relational database that runs directly in Node.js, making local development and automated testing fast and portable. For production, the project includes ready-to-deploy PostgreSQL schemas ([`prisma/schema.postgresql.prisma`](file:///c:/Users/chinnari/Desktop/snovasys/prisma/schema.postgresql.prisma)) and Row-Level Security policies with immutability triggers ([`prisma/rls_policies.sql`](file:///c:/Users/chinnari/Desktop/snovasys/prisma/rls_policies.sql)).

### Q8: Why did you use Tailwind CSS instead of a pre-built component library like Material-UI or Bootstrap?
**Answer:** Tailwind CSS is a utility-first framework that compiles to minimal CSS. It allowed us to design a custom "Cyber-Vault" dark-mode theme using our own brand color tokens (`vault` emeralds and `shield` slate tones) without being constrained by the default styling or heavy JavaScript bundle overhead of component libraries.

---

## 3. Frontend vs. Backend Separation

### Q9: How does the React frontend communicate with the backend?
**Answer:** The frontend uses the standard web `fetch()` API to send asynchronous HTTP requests (`GET`, `POST`, `DELETE`) to Next.js Route Handlers (`/api/*`). Session cookies (`trustvault_session`) are automatically included by the browser in the request headers.

### Q10: How does the frontend handle loading and error states?
**Answer:** Every data-fetching React component uses React state variables (e.g., `loading`, `error`). Before an API call starts, `setLoading(true)` is called to render animated spinners or skeletons. If the API returns a non-200 status code, the response JSON error message is caught and displayed in an animated error alert banner.

### Q11: What is the purpose of the 60-second visual countdown timer on the Dashboard?
**Answer:** When a user clicks Download, the server issues a presigned URL valid for exactly 60 seconds. To give the user clear feedback before the link expires, a React `useEffect` interval decrements a countdown timer every second. When it reaches zero, the download button resets to prevent stale link usage.

---

## 4. Database vs. Object Storage

### Q12: Why are file contents stored in a storage vault rather than as BLOBs directly in the database?
**Answer:** Storing large binary files (e.g., 10MB PDFs) as `BLOB` columns in a database degrades database query performance, bloats database backups, and exhausts database memory buffers. Best practices dictate storing lightweight metadata (title, category, ownerId, size) in the relational database, while raw binary bytes are stored in private object storage (S3/R2 or an unexposed filesystem folder).

### Q13: How does TrustVault prevent filename collision or directory traversal attacks?
**Answer:** When a file is uploaded, the original user-supplied filename is stored only as a display title in the database. The physical file on disk or in S3 is saved using a cryptographically randomized UUID key: `doc_${crypto.randomUUID()}.${ext}`. This completely prevents directory traversal (`../../etc/passwd`) and overwriting existing files with identical names.

---

## 5. Authentication vs. Authorization

### Q14: What is the fundamental difference between Authentication and Authorization?
**Answer:** 
* **Authentication (401 Unauthorized):** Verifies *who you are* (e.g., verifying user credentials via email and password, issuing a JWT cookie).
* **Authorization (403 Forbidden):** Verifies *what you are allowed to do* (e.g., checking if user `viewer_123` has an active `canRead` permission on document `doc_456`).

### Q15: How does TrustVault implement session management?
**Answer:** TrustVault uses the `jose` library to sign JSON Web Tokens (JWT) using `HS256` with an 8-hour expiration. The token is stored in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie. Because the cookie is `HttpOnly`, client-side JavaScript cannot access it, mitigating Cross-Site Scripting (XSS) token theft.

### Q16: How are passwords stored in the database?
**Answer:** Passwords are never stored in plaintext. They are hashed using `bcryptjs` with a cost factor (salt rounds) of 10. Bcrypt automatically generates a unique salt for every password, protecting against rainbow table attacks.

---

## 6. Access Control & User Roles

### Q17: What are the three roles in TrustVault and their boundaries?
**Answer:**
1. **`owner`:** Sovereign data custodian. Can upload, view, edit, delete their own documents, grant/revoke permissions, and inspect scoped audit reports.
2. **`admin`:** System infrastructure and compliance officer. Can view global system logs, verify the cryptographic hash chain, and inspect platform reports. Cannot read or delegate Owner files without explicit Owner permission.
3. **`viewer`:** Least-privilege consumer. Can only view or download documents explicitly granted to them by an Owner. Cannot upload files or inspect audit logs.

### Q18: What is the `canShare` permission flag?
**Answer:** `canShare` is a delegation permission. If an Owner grants an Admin `canShare: true`, that Admin is authorized to act as an access manager and grant read/download access to Viewers on behalf of the Owner. If an Admin lacks `canShare: true`, any attempt to delegate access returns `403 Forbidden`.

### Q19: What happens when an Owner revokes a user's permission?
**Answer:** The backend immediately executes `prisma.documentPermission.deleteMany()`, removing the row from the database (or setting `revokedAt`). Because there is zero caching in Redis or JWT claims, the very next request by that user queries the database, finds no active record, blocks the access, and writes an `UNAUTHORIZED_ACCESS_BLOCKED` record to the audit chain.

---

## 7. Security & Vulnerability Defenses

### Q20: What is IDOR / BOLA and how does TrustVault prevent it?
**Answer:** Insecure Direct Object Reference (IDOR) happens when an attacker modifies a file ID in an API request (e.g., requesting `/api/documents/classified-doc-id/download`) to access another user's file. TrustVault prevents this because the `verifyDocumentAccess` guard queries `DocumentPermission` on the server thread for the combination of `(documentId, requestingUserId)`. If no matching row exists, the server blocks execution, logs the probe, and returns `403 Forbidden`.

### Q21: What is "Magic Byte Sniffing" and why is checking file extensions not enough?
**Answer:** File extensions (like `.pdf` or `.png`) are untrusted user input that anyone can change. An attacker can rename an executable malware (`trojan.exe`) to `invoice.pdf`. TrustVault reads the raw file buffer on the server and checks the first 8 bytes for authentic binary magic headers (`%PDF-` for PDF, `\x89PNG` for PNG, `50 4B 03 04` for Office OpenXML). Disguised executables starting with `MZ` (`4D 5A`) are immediately rejected.

### Q22: What security HTTP response headers are set when streaming a file?
**Answer:** When `/api/documents/stream` delivers file bytes, it sets:
* `Cache-Control: no-store, no-cache, must-revalidate, private` (prevents browser and intermediate proxy caching).
* `X-Content-Type-Options: nosniff` (prevents MIME-type confusion attacks in the browser).
* `X-Frame-Options: DENY` (prevents clickjacking attacks).

---

## 8. Cryptographic Audit Hash Chain

### Q23: How does the Cryptographic Audit Hash Chain work?
**Answer:** Every audit event entry is linked to the preceding entry using SHA-256:

$$\text{currentHash} = \text{SHA-256}(\text{id} \parallel \text{actorId} \parallel \text{action} \parallel \text{targetId} \parallel \text{ipAddress} \parallel \text{status} \parallel \text{timestamp} \parallel \text{previousHash})$$

The chain starts at a known Genesis block (`00000000...`). If an attacker alters any database row, its hash changes, breaking the link to every subsequent row.

### Q24: How does the Admin Integrity Verifier detect tampering?
**Answer:** The verifier in [`src/lib/audit.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/lib/audit.ts#L97-L150) fetches all audit rows sorted by timestamp. It recalculates the SHA-256 hash for each row using the recalculated hash of the previous row. If the recalculated hash does not match the stored `currentHash`, it stops and outputs `isValid: false`, the corrupted record ID, and the exact row index.

### Q25: How does the system handle concurrent audit writes without breaking the hash chain?
**Answer:** In [`src/lib/audit.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/lib/audit.ts#L25-L35), writes are serialized using an in-process Promise queue (`writeQueue = writeQueue.then(...)`) combined with strictly monotonic millisecond timestamps. This guarantees that two simultaneous requests are processed sequentially, each linking to the correct previous hash.

---

## 9. AI Safety & Governance

### Q26: What is the role of the AI Assistant in TrustVault?
**Answer:** The AI assistant analyzes document metadata (title and category) to recommend eligible organizational users who should be granted read access under the Principle of Least Privilege.

### Q27: How does TrustVault prevent AI Excessive Agency (OWASP LLM06)?
**Answer:** The AI has **zero write permissions** to the database. It cannot create or modify permissions autonomously. It only generates candidate proposals in memory. A human Owner must explicitly review the candidates and click **"Confirm & Grant"** to execute the database write. Both the suggestion generation and the human confirmation are recorded in the audit ledger.

---

## 10. Audit Logs, Compliance & Reports

### Q28: What is two-phase download tracking?
**Answer:** To prevent unmonitored file exfiltration, downloads are logged in two phases:
1. `DOCUMENT_DOWNLOAD_INITIATED`: When the user requests and receives the 60-second presigned URL.
2. `DOCUMENT_STREAM_COMPLETED`: When the browser actually connects to the stream and finishes transferring the file bytes.

### Q29: Can Document Owners see Audit Logs and Reports?
**Answer:** Yes. The Owner Dashboard includes dedicated **Audit Logs**, **Compliance**, and **Reports** tabs. However, the backend strictly scopes the data: Owners can only see events and metrics related to their own documents or actions. They cannot see logs from other Owners.

---

## 11. Testing & Limitations

### Q30: What automated testing framework is used and what is the test coverage?
**Answer:** We use **Vitest 2.1.3**. The project has **36 passing automated tests across 6 test suites**, covering authorization boundaries, IDOR attacks, instant revocation, magic byte sniffing, cryptographic tamper detection, and owner-scoped audit reports.

### Q31: What are the current technical limitations of the system?
**Answer:**
1. The Promise write mutex for audit logging runs in Node.js memory, meaning horizontal scaling across multiple load-balanced servers would require distributed Redis locking.
2. Storage at rest in local development mode relies on OS filesystem encryption.
3. Native PostgreSQL Row-Level Security policies are scripted in SQL and require production deployment to PostgreSQL.

### Q32: What future enhancements would you propose?
**Answer:**
1. Implementing client-side WebCrypto envelope encryption before upload so files are encrypted before reaching the server.
2. Adding Multi-Factor Authentication (MFA / TOTP) using authenticator apps.
3. Integrating distributed Redis rate-limiting (e.g., Upstash) and SIEM webhook integrations (Splunk, Datadog).

---

## 12. Quick-Fire Architectural Questions

### Q33: What HTTP status code is returned when a user attempts an IDOR attack?
**Answer:** `403 Forbidden`. A generic error message is returned to prevent revealing whether the confidential document exists.

### Q34: What is the maximum allowed file upload size?
**Answer:** Exactly 10 Megabytes (`10 * 1024 * 1024` bytes), enforced both on the client in `UploadModal.tsx` and on the server buffer in `src/lib/crypto.ts`.

### Q35: What happens if an unauthorized user calls the audit query endpoint?
**Answer:** In [`src/app/api/audit/route.ts`](file:///c:/Users/chinnari/Desktop/snovasys/src/app/api/audit/route.ts#L15), the backend checks `user.role`. If the user is a `viewer` (neither admin nor owner), it immediately returns `403 Forbidden`.
