-- One-time, fail-closed first administrator bootstrap state.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_bootstrap_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES admin_users(id)
);
INSERT INTO admin_bootstrap_state(id, completed_at, completed_by)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
COMMIT;
