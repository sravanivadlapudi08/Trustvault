# TrustVault: Mentor Assessment Presentation Guide

This guide is structured slide-by-slide for your project assessment and viva presentation. Each slide includes **visual bullet points**, **conversational speaking notes** (written in simple English for a B.Tech IT student), and **likely mentor questions with accurate answers**.

---

## Slide 1: Title & Project Introduction

### Slide Content
* **Project Name:** TrustVault 🛡️
* **Subtitle:** Production-Ready, Zero-Trust Document Vault with Cryptographic Audit Chaining
* **Developer:** B.Tech Information Technology Final Year Project
* **Core Philosophy:** Zero-Trust Architecture • Data Custodianship • Immutable Cryptographic Audit

### Speaking Notes
> "Good morning, respected mentors. Today, I am proud to present my project, **TrustVault**.
>
> In simple terms, TrustVault is a highly secure document storage and sharing web application designed for organizations that handle confidential records like financial reports, contracts, and sensitive data.
>
> What makes TrustVault unique is that it doesn't just assume a user is safe because they logged in. It follows the **Zero-Trust principle**: every single file request is verified against the database in real time. Access can be revoked with zero delay, files are stored privately, and every action is sealed into a mathematical SHA-256 cryptographic audit chain inspired by blockchain technology."

### Likely Mentor Questions & Answers
* **Q: Why did you name it 'Zero-Trust'?**
  * **Answer:** "Zero-Trust means 'Never trust, always verify.' In traditional systems, once someone logs in, they are trusted to access files. In TrustVault, every request to read or download a document runs a live database check on the server thread to verify active permissions, even milliseconds after an access change."

---

## Slide 2: Problem Statement & Motivation

### Slide Content
* **Broken Object Level Authorization (IDOR):** Changing a URL parameter exposes other users' confidential files.
* **Zombie Access (Revocation Latency):** Removing user access often takes minutes or hours to propagate due to caching.
* **Public Bucket Leaks:** Files placed in cloud buckets with public or guessable URLs get scraped.
* **Audit Tampering:** Typical database logs can be deleted or altered by compromised administrator accounts.
* **Disguised Malware (Polyglot Files):** Attackers rename malicious executables (`.exe`) to `.pdf`.

### Speaking Notes
> "When looking at popular file sharing platforms, we identified major security flaws:
>
> First, **Insecure Direct Object References (IDOR)**—an attacker simply changes a document ID in the browser URL to view someone else's file.
> Second, **Zombie Access**—when an employee is terminated, caching in Redis or CDNs often allows them to download files for another hour.
> Third, **Audit Tampering**—if an administrator account is compromised, the attacker can delete database logs to hide their tracks.
> And fourth, **Fake Files**—attackers rename an `.exe` file to `.pdf` and upload malware.
>
> TrustVault was engineered to solve every single one of these vulnerabilities."

### Likely Mentor Questions & Answers
* **Q: Can't standard cloud storage like Google Drive solve this?**
  * **Answer:** "Google Drive is designed for collaboration and productivity, not high-security compliance. In Google Drive, anyone with a shared link can access files, permissions take time to sync, and standard users cannot mathematically prove to an auditor that logs have not been manipulated."

---

## Slide 3: Objectives & Scope

### Slide Content
* **Rule One (Live DB Authorization):** Zero client-side trust. Every action verifies live database records.
* **Rule Two (Instant Revocation):** When permission is revoked, subsequent downloads fail immediately (0-second delay).
* **Rule Three (Private Storage Only):** Files reside in private vaults; access is granted only via 60-second timed URLs.
* **Immutable Audit Trail:** SHA-256 hash chaining anchored to a Genesis Block.
* **Deep File Sanitization:** Magic byte sniffing on raw file buffers to reject polyglots.
* **Safe AI Integration:** Human-in-the-loop AI permission suggestions with zero direct database write permissions.

### Speaking Notes
> "The objective of TrustVault is to establish a secure document repository based on three strict rules:
>
> Rule One: Live Database Authorization on every single request.
> Rule Two: Instant Revocation—taking access away works immediately without waiting for tokens to expire.
> Rule Three: 100% Private Storage—no file ever has a permanent public URL. Files are downloaded only through links valid for a maximum of 60 seconds.
>
> We also incorporated an immutable cryptographic audit ledger, magic byte file inspection, and a safe AI assistant where the human owner always has the final say."

---

## Slide 4: Real-World Use Cases

### Slide Content
* **Corporate Mergers & Acquisitions (M&A):** Sharing confidential financial audit ledgers with external auditors with instant revocation.
* **Healthcare & Patient Records:** Sharing diagnostic scans under strict HIPAA-like privacy with timed links.
* **Intellectual Property Protection:** Safeguarding core engineering blueprints and firmware source code.
* **Forensic Auditing:** Providing external auditors with mathematical proof that compliance records have not been altered.

### Speaking Notes
> "TrustVault has immediate real-world applications.
>
> In corporate finance, during mergers and acquisitions, companies need to share confidential revenue projections with external lawyers. Once negotiations end, access must be cut off instantly.
> In healthcare, patient medical files can be shared with consulting doctors using 60-second links, preventing unauthorized forwarding.
> And for legal compliance, our cryptographic hash chain allows an organization to prove to a judge or auditor that the activity logs are 100% authentic and unmanipulated."

---

## Slide 5: Complete Technology Stack

### Slide Content
* **Frontend:** Next.js 14.2 (App Router), React 18.3, TypeScript 6.0
* **Styling & Icons:** Tailwind CSS 3.4 (Cyber-Vault Dark Theme), Lucide React
* **Backend:** Next.js REST Route Handlers (`src/app/api/`), Node.js v22
* **Database & ORM:** Prisma ORM 5.21, SQLite (Local Dev/Tests), PostgreSQL RLS (Production)
* **Authentication & Crypto:** `jose` (HS256 JWT, HttpOnly Cookies), `bcryptjs`, Node.js native `crypto`
* **Storage:** Modular `StorageDriver` (Private Local Vault + Cloudflare R2 / AWS S3)
* **Testing:** Vitest 2.1 (36 passing automated tests)

### Speaking Notes
> "Let's examine our technology stack:
>
> For the frontend, we use **Next.js 14 with TypeScript and React 18**. This gives us type safety and server-side rendering. We designed a custom Cyber-Vault dark theme using **Tailwind CSS**.
> For the backend, we use **Next.js Route Handlers** running on Node.js.
> For the database, we use **Prisma ORM** with **SQLite** for development and testing, and we have complete **PostgreSQL Row-Level Security** scripts for production.
> For security, we use **jose** for HttpOnly JWT session cookies, **bcryptjs** for salted password hashing, and Node's native **crypto module** for SHA-256 hash chaining.
> Finally, our entire project is verified using **Vitest** with 36 automated security tests."

### Likely Mentor Questions & Answers
* **Q: Why did you use Next.js App Router instead of a separate Express.js backend?**
  * **Answer:** "Next.js App Router allows us to build both the React frontend and server-side REST API handlers in a single, unified TypeScript codebase. It eliminates cross-origin resource sharing (CORS) setup issues and allows end-to-end type sharing with Prisma ORM."

---

## Slide 6: System Architecture & Trust Boundaries

### Slide Content
* **Layer 1: Client Layer** — Browser running React UI with HttpOnly session cookies.
* **Layer 2: Transport & Gateway** — HTTPS TLS termination and REST API routing.
* **Layer 3: Security Perimeter** — Session validation, `verifyDocumentAccess` guard, and binary file sniffer.
* **Layer 4: Data & Ledger** — Relational database (Prisma) and private storage bucket.
* **Layer 5: Immutable Audit Ledger** — Sequential Promise queue appending SHA-256 chained records.

### Speaking Notes
> "This diagram illustrates our multi-layered architecture:
>
> The user interacts with the browser, which sends HTTPS requests carrying an HttpOnly session cookie.
> The Next.js API layer first checks the user's session claims using `jose`.
> Before touching any file, our Zero-Leak guard `verifyDocumentAccess` queries the database to confirm active permissions.
> If unauthorized, it immediately traps the attempt and logs it as `UNAUTHORIZED_ACCESS_BLOCKED`.
> If authorized, our Storage Driver generates a 60-second timed download link from our private vault, and logs the download in our cryptographic ledger."

---

## Slide 7: Zero-Trust Access Control & Data Custodianship

### Slide Content
* **Owner Sovereignty:** The Document Owner is the sole master of their data.
* **Separation of Duties:**
  * **Owner:** Data plane authority (upload, manage permissions, delete, view scoped reports).
  * **Admin:** Control plane authority (infrastructure health, system audit logs, hash chain verification).
  * **Viewer:** Read-only or download access explicitly granted by an Owner.
* **Admin Authority Constraint:** Admins **cannot read or delegate** Owner documents unless the Owner explicitly grants them permissions or `canShare: true` rights.

### Speaking Notes
> "One of our most important design decisions is **Data Custodianship**.
>
> In many legacy systems, an IT Admin has 'God Mode'—they can read any executive's files. In TrustVault, we enforce Separation of Duties.
> The **Owner** has exclusive sovereignty over their files. An **Admin** manages the infrastructure and verifies the audit chain, but cannot read or share an Owner's document unless the Owner explicitly grants them access in the database.
> The **Viewer** can only see documents explicitly granted to them."

### Likely Mentor Questions & Answers
* **Q: What happens if an Admin tries to access an Owner's private document?**
  * **Answer:** "The `verifyDocumentAccess` guard checks the `DocumentPermission` table. Since there is no row granting access to the Admin, the request is halted, an `UNAUTHORIZED_ACCESS_BLOCKED` record is written to the audit chain, and the Admin receives a `403 Forbidden` error."

---

## Slide 8: Multi-Layered Security & IDOR Defenses

### Slide Content
* **Defense 1: Insecure Direct Object Reference (IDOR) Defense:** Server thread database lookup prevents URL tampering.
* **Defense 2: Instant Permission Revocation:** Zero caching latency; permission deletes take effect in milliseconds.
* **Defense 3: 60-Second Timed Ephemeral URLs:** No permanent public URLs; streams re-verify authorization at transfer time.
* **Defense 4: Binary Magic Byte Sniffing:** Checks raw hex signatures (`%PDF-`, PNG, JPEG, OpenXML) to defeat polyglots.
* **Defense 5: XSS-Proof Session Cookies:** `HttpOnly`, `SameSite=Lax` cookies prevent JavaScript token theft.

### Speaking Notes
> "We implement defense-in-depth across five security layers:
>
> First, IDOR defense—every file lookup requires an active permission row for the requesting user.
> Second, instant revocation—when an Owner revokes a user, subsequent downloads fail immediately.
> Third, 60-second download links—files are only accessible through short-lived presigned URLs.
> Fourth, magic byte sniffing—if someone renames a malicious `.exe` file to `.pdf`, our server reads the file's raw binary header, identifies the executable signature, and rejects the upload.
> And fifth, our session tokens are stored in HttpOnly cookies, meaning client-side JavaScript cannot read them, protecting against XSS attacks."

---

## Slide 9: Cryptographic Audit Hash Chain (Blockchain-like Ledger)

### Slide Content
* **Recursive SHA-256 Hash Chaining:**
  $$\text{currentHash} = \text{SHA-256}(\text{id} \parallel \text{actorId} \parallel \text{action} \parallel \text{targetId} \parallel \text{ipAddress} \parallel \text{status} \parallel \text{timestamp} \parallel \text{previousHash})$$
* **Genesis Anchor:** Begins at `0000000000000000000000000000000000000000000000000000000000000000`.
* **Tamper-Evident:** Any database alteration immediately breaks the hash of that row and all future rows.
* **One-Click Verifier:** Recomputes the entire chain from genesis to head in real time.
* **Thread-Safe Mutex:** Sequential Promise write queue prevents race conditions.

### Speaking Notes
> "Now let's examine our audit logging engine.
>
> In typical web apps, audit logs are stored in a simple SQL table that anyone with database access can alter.
> In TrustVault, we implemented a **SHA-256 Cryptographic Hash Chain**, very similar to a blockchain.
> Every single log entry contains a `previousHash` and a `currentHash`. The current hash is computed using the record's ID, actor, action, target, IP address, timestamp, and the preceding record's hash.
> If an attacker or insider DBA tampers with even one character in a past record, the mathematical chain breaks. Our Admin Compliance page re-calculates the hashes and immediately pinpoints the exact corrupted record ID."

### Likely Mentor Questions & Answers
* **Q: How does this differ from a full blockchain?**
  * **Answer:** "A public blockchain uses distributed consensus mechanisms like Proof-of-Work to agree on data across thousands of untrusted nodes. TrustVault uses centralized hash-chaining (similar to Git commit trees or certificate transparency logs) which provides the same mathematical immutability and tamper detection with zero cryptocurrency overhead and sub-millisecond write speeds."

---

## Slide 10: Audit Logs, Compliance & Reports

### Slide Content
* **Two-Phase Download Auditing:** Records `DOCUMENT_DOWNLOAD_INITIATED` (URL issued) and `DOCUMENT_STREAM_COMPLETED` (bytes transferred).
* **Document View Tracking:** Records `DOCUMENT_VIEW` with viewer role and timestamp.
* **Multi-Tenant Scoping:**
  * **Owner Dashboard:** Audit logs and reports are strictly scoped to the Owner's documents.
  * **Admin Dashboard:** Global system oversight across all tenants and security alarms.
* **Automated Aggregates:** Total uploads, downloads, views, active shares, blocked probes, and daily activity timeline charts.

### Speaking Notes
> "Both Document Owners and Administrators have full access to Audit Logs and Compliance Reports, but with strict tenant isolation.
>
> An Owner sees logs and reports strictly for their own documents. They can see who viewed their file, who downloaded it, and whether any unauthorized user attempted to probe it.
> The Admin sees global platform statistics and security alarms without being able to see confidential file contents.
> Downloads are tracked in two phases: when the URL is generated, and when the bytes are actually transferred through the stream."

---

## Slide 11: Human-in-the-Loop Safe AI Governance

### Slide Content
* **AI Access Governance Assistant:** Scans document titles and categories to suggest eligible candidate reviewers.
* **Advisory Agency Only:** The AI has **zero write permissions** to the database.
* **Mandatory Human Confirmation:** The document Owner must review suggestions and click **'Confirm & Grant'** to execute the database write.
* **Dual Audit Logging:** Both `AI_PERMISSION_SUGGESTION_GENERATED` and `AI_PERMISSION_CONFIRMED_BY_HUMAN` are permanently sealed in the audit chain.
* **Mitigates OWASP LLM Excessive Agency (LLM06).**

### Speaking Notes
> "To assist document owners with least-privilege sharing, we built an AI Access Governance Assistant.
>
> For example, if an Owner uploads a 'Q3 Financial Audit', the AI identifies the 'Finance' category and suggests financial analysts as reviewers.
> However, to prevent **AI Excessive Agency**—where an autonomous bot might accidentally grant unauthorized access—our AI operates under a strict **Human-in-the-Loop constraint**.
> The AI has zero database write access. It can only propose suggestions in memory. The human Owner must explicitly review and confirm the delegation. Both the AI's proposal and the human's confirmation are logged to the audit chain."

---

## Slide 12: Automated Testing & Verification Proof

### Slide Content
* **Test Runner:** Vitest 2.1.3
* **Test Results:** **36 Tests Passed across 6 Suites (100% Pass Rate)**
* **Suites Verified:**
  1. `owner-audit-reports.test.ts` (10 tests)
  2. `authorization-boundaries.test.ts` (9 tests)
  3. `admin-delegation-flow.test.ts` (7 tests)
  4. `file-validation-magic-bytes.test.ts` (6 tests)
  5. `audit-tamper-chain.test.ts` (2 tests)
  6. `ai-safety-constraint.test.ts` (2 tests)

### Speaking Notes
> "We did not just write the security rules—we proved them mathematically through automated testing.
>
> Our test suite is powered by **Vitest** and includes **36 automated security tests across 6 dedicated test suites**.
> We have automated tests verifying:
> That unauthorized users get an immediate 403 error on IDOR probes.
> That instant revocation stops downloads within milliseconds.
> That disguised `.exe` files are detected and rejected.
> That simulated database tampering breaks the SHA-256 chain and flags the corrupted row.
> And that the AI cannot mutate permissions without human confirmation.
> Every single test passes cleanly in under 4 seconds."

---

## Slide 13: Technical Limitations & Future Work

### Slide Content
* **Current Limitations:**
  * Single-Node In-Process Mutex: Memory queue for audit writes is designed for single-server setups.
  * Local Storage At Rest: Relies on OS filesystem encryption when running locally.
  * SQLite vs PostgreSQL RLS: SQLite used for dev/test; PostgreSQL RLS scripts ready for cloud deployment.
* **Future Enhancements:**
  * Distributed locking using Redis / PostgreSQL advisory locks for horizontal scaling.
  * In-browser client-side WebCrypto envelope encryption before upload.
  * Multi-Factor Authentication (MFA / TOTP) via authenticator apps.
  * Webhook integrations for SIEM platforms (Splunk, Datadog).

### Speaking Notes
> "In the spirit of engineering transparency, we also identified current limitations and our roadmap for future work:
>
> Currently, our cryptographic write mutex runs in-process in Node.js memory. For horizontal scaling across multiple Kubernetes pods, we plan to implement distributed Redis locks.
> In local mode, files rely on filesystem encryption, so our next step is adding client-side envelope encryption using the browser WebCrypto API.
> We also plan to integrate Multi-Factor Authentication (MFA) and export audit logs directly to enterprise SIEM platforms like Splunk."

---

## Slide 14: Conclusion & Key Takeaways

### Slide Content
* **Zero-Leak Enforced:** Every request verified against live database permissions.
* **True Owner Custodianship:** No admin can bypass document sovereignty.
* **Blockchain-Inspired Integrity:** SHA-256 cryptographic chaining proves tamper-free audit logs.
* **Production-Ready & 100% Tested:** 36 automated security tests verifying all boundaries.
* **Thank You! Questions & Discussion.**

### Speaking Notes
> "In conclusion, TrustVault demonstrates that high-security document sharing does not have to be complex or slow.
>
> By combining a Zero-Trust architecture, strict Data Custodianship, short-lived 60-second URLs, and an immutable cryptographic audit ledger, we created a platform that protects high-value enterprise assets against IDOR leaks, zombie access, log tampering, and rogue administrators.
>
> Thank you, respected mentors, for your time and guidance. I welcome your questions and feedback!"
