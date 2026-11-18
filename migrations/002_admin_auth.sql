-- Access control baseline. Administrative accounts must be explicitly provisioned.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_issuer TEXT NOT NULL,
  oidc_subject TEXT NOT NULL,
  display_name VARCHAR(220),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (oidc_issuer, oidc_subject)
);
CREATE TABLE IF NOT EXISTS admin_roles (
  code VARCHAR(50) PRIMARY KEY,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_permissions (
  resource VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  PRIMARY KEY(resource, action)
);
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_code VARCHAR(50) NOT NULL REFERENCES admin_roles(code) ON DELETE CASCADE,
  resource VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  PRIMARY KEY(role_code, resource, action),
  FOREIGN KEY(resource, action) REFERENCES admin_permissions(resource, action) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS admin_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL REFERENCES admin_roles(code),
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('global', 'unit', 'record')),
  scope_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope_type='global' AND scope_id IS NULL) OR (scope_type<>'global' AND scope_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_role_assignment_unique ON
  admin_role_assignments(user_id,role_code,scope_type,scope_id)
  NULLS NOT DISTINCT;
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_sha256 CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  resource VARCHAR(80) NOT NULL,
  resource_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO admin_roles(code,description) VALUES
 ('technical_admin','Manage approved admin accounts and system configuration only'),
 ('activity_editor','Edit and submit activities within assigned scope'),
 ('activity_approver','Approve and publish activities within assigned scope'),
 ('media_editor','Register and manage media within assigned scope'),
 ('media_approver','Approve media within assigned scope'),
 ('content_viewer','Read internal editorial material within assigned scope')
ON CONFLICT(code) DO NOTHING;
INSERT INTO admin_permissions(resource,action) VALUES
 ('admin_users','manage'),('admin_roles','manage'),
 ('activities','view'),('activities','edit'),('activities','submit'),
 ('activities','approve'),('activities','publish'),('activities','verify_results'),
 ('media','view'),('media','create'),('media','approve'),('media','revoke')
ON CONFLICT(resource,action) DO NOTHING;
INSERT INTO admin_role_permissions(role_code,resource,action) VALUES
 ('technical_admin','admin_users','manage'),
 ('technical_admin','admin_roles','manage'),
 ('activity_editor','activities','view'),
 ('activity_editor','activities','edit'),
 ('activity_editor','activities','submit'),
 ('activity_approver','activities','view'),
 ('activity_approver','activities','approve'),
 ('activity_approver','activities','publish'),
 ('activity_approver','activities','verify_results'),
 ('media_editor','media','view'),
 ('media_editor','media','create'),
 ('media_approver','media','view'),
 ('media_approver','media','approve'),
 ('media_approver','media','revoke'),
 ('content_viewer','activities','view'),
 ('content_viewer','media','view')
ON CONFLICT(role_code,resource,action) DO NOTHING;
-- No admin users or initial credentials are created here.
COMMIT;
