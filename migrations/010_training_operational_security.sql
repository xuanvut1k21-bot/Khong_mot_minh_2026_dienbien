-- 010: PostgreSQL-backed abuse budgets and safe temporary-record expiry.
-- All counters are transactionally enforced across Next.js workers.
BEGIN;
CREATE TABLE training_registration_limits (
  bucket_key TEXT PRIMARY KEY CHECK (bucket_key='global'),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used INTEGER NOT NULL CHECK (used BETWEEN 1 AND 300)
);
CREATE TABLE training_learner_rate_limits (
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('exam_start','exam_submit')),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used INTEGER NOT NULL CHECK (used BETWEEN 1 AND 30),
  PRIMARY KEY(learner_id,action)
);
CREATE INDEX idx_training_sessions_expiry ON training_sessions(expires_at);
CREATE INDEX idx_training_handoffs_unconsumed_expiry
  ON training_survey_handoffs(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX idx_training_attempts_expiry
  ON training_attempts(expires_at) WHERE status='in_progress';
CREATE INDEX idx_training_learners_created_at ON training_learners(created_at);
COMMIT;
