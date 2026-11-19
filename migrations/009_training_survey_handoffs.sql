-- 009: Correlated, time-limited survey verification for lesson 1 and 9.
-- Public QR contains only a fixed local landing URL, never learner identifiers.
BEGIN;
CREATE TABLE training_survey_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  lesson_number SMALLINT NOT NULL CHECK (lesson_number IN (1,9)),
  token_sha256 CHAR(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);
CREATE INDEX idx_training_handoffs_learner
  ON training_survey_handoffs(learner_id,lesson_number,issued_at DESC);
ALTER TABLE training_verified_surveys
  ADD COLUMN handoff_id UUID UNIQUE REFERENCES training_survey_handoffs(id) ON DELETE CASCADE;

-- Historic confirmations, if any, are not silently mapped to an unknown handoff.
-- The new webhook always records handoff_id after checking its signed correlation.
COMMIT;
