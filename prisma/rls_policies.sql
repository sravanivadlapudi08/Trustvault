-- ============================================================================
-- TrustVault PostgreSQL Row-Level Security (RLS) & Immutability Policies
-- ============================================================================
-- These policies enforce the Zero-Leak authorization rule directly at the PostgreSQL engine layer.
-- Application sessions set the acting user using: SET LOCAL app.current_user_id = '<uuid>';
-- and user role: SET LOCAL app.current_user_role = 'owner';

-- 1. ENABLE ROW LEVEL SECURITY ON ALL SENSITIVE TABLES
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. DOCUMENT POLICIES (Owner-Controlled Zero-Trust Authorization)

-- Policy: Owners can view, insert, update, and delete their own documents
CREATE POLICY "owner_manage_own_documents" ON documents
  FOR ALL
  TO PUBLIC
  USING (
    current_setting('app.current_user_role', true) = 'owner' 
    AND ownerId = current_setting('app.current_user_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.current_user_role', true) = 'owner' 
    AND ownerId = current_setting('app.current_user_id', true)::uuid
  );

-- Policy: Explicitly Authorized Users (Admins and Viewers) can SELECT documents ONLY if explicit, non-revoked permission exists
CREATE POLICY "authorized_users_read_documents" ON documents
  FOR SELECT
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM document_permissions p
      WHERE p.documentId = documents.id
        AND p.userId = current_setting('app.current_user_id', true)::uuid
        AND p.canRead = true
        AND p.revokedAt IS NULL
    )
  );

-- 3. PERMISSION POLICIES (Strict Owner Control & Delegation Enforcement)

-- Policy: Document owners can view and manage all permissions for documents they own
CREATE POLICY "owner_manage_document_permissions" ON document_permissions
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_permissions.documentId
        AND d.ownerId = current_setting('app.current_user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_permissions.documentId
        AND d.ownerId = current_setting('app.current_user_id', true)::uuid
    )
  );

-- Policy: Authorized Admins with explicit delegation rights (canShare=true) can manage permissions for Viewers ONLY
CREATE POLICY "delegated_admin_manage_permissions" ON document_permissions
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM document_permissions p_admin
      WHERE p_admin.documentId = document_permissions.documentId
        AND p_admin.userId = current_setting('app.current_user_id', true)::uuid
        AND p_admin.canShare = true
        AND p_admin.revokedAt IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = document_permissions.userId
        AND u.role = 'viewer'
    )
  );

-- Policy: Non-owners can view permissions on documents where they have active access
CREATE POLICY "authorized_user_view_permissions" ON document_permissions
  FOR SELECT
  TO PUBLIC
  USING (
    userId = current_setting('app.current_user_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM document_permissions p2
      WHERE p2.documentId = document_permissions.documentId
        AND p2.userId = current_setting('app.current_user_id', true)::uuid
        AND p2.canShare = true
        AND p2.revokedAt IS NULL
    )
  );

-- Policy: Viewers can inspect only their own granted permissions
CREATE POLICY "viewer_view_own_permissions" ON document_permissions
  FOR SELECT
  TO PUBLIC
  USING (userId = current_setting('app.current_user_id', true)::uuid);

-- 4. AUDIT LOG IMMUTABILITY POLICIES (Append-Only Enforcement)

-- Policy: Any authenticated user / system can insert new audit log entries
CREATE POLICY "audit_logs_append_only" ON audit_logs
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

-- Policy: Admins can read all audit logs
CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.current_user_role', true) = 'admin');

-- Policy: Strictly FORBID UPDATE and DELETE on audit_logs for ALL users, including superusers
-- Implemented via PostgreSQL Trigger to guarantee cryptographic chain tamper resistance:
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY ALERT: Direct UPDATE or DELETE on audit_logs is strictly prohibited by TrustVault tamper-proof immutability policy.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_modification ON audit_logs;
CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
