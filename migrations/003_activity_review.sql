-- Activity editorial workflow: applies after 001_public_content and 002_admin_auth.
BEGIN;
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES admin_users(id);
ALTER TABLE activity_results
  ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES admin_users(id);
ALTER TABLE activity_results
  ADD CONSTRAINT activity_results_separate_reviewers
  CHECK (entered_by IS NULL OR verified_by IS NULL OR entered_by <> verified_by);

CREATE TABLE IF NOT EXISTS activity_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id),
  actor_id UUID NOT NULL REFERENCES admin_users(id),
  action VARCHAR(25) NOT NULL CHECK (
    action IN ('create','edit','submit','return','approve','publish','complete','save_result','verify_result')
  ),
  from_status VARCHAR(20),
  to_status VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_review_events ON activity_review_events(activity_id,created_at DESC);
COMMIT;
