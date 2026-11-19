-- 007: Training foundation. Enrollment, surveys and examinations are disabled
-- until privacy notice, curriculum, verified survey provider and vetted question bank exist.
BEGIN;

CREATE TABLE training_lessons (
  lesson_number SMALLINT PRIMARY KEY CHECK (lesson_number BETWEEN 1 AND 9),
  title VARCHAR(250),
  approved_material_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  approved_by UUID REFERENCES admin_users(id),
  published_at TIMESTAMPTZ,
  CHECK (
    status <> 'published' OR
    (title IS NOT NULL AND length(trim(title)) >= 3 AND
     approved_material_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{15,128}/view/?
     AND published_at IS NOT NULL)
  )
);
-- Nine *unpublished slots*, not nine fabricated lessons.
INSERT INTO training_lessons(lesson_number)
SELECT generate_series(1,9);

CREATE TABLE training_learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  school_name VARCHAR(220) NOT NULL CHECK (length(trim(school_name)) BETWEEN 2 AND 220),
  privacy_acknowledged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  token_sha256 CHAR(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX idx_training_sessions_lookup ON training_sessions(token_sha256,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE training_verified_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  lesson_number SMALLINT NOT NULL CHECK (lesson_number IN (1,9)),
  provider_event_id VARCHAR(180) NOT NULL UNIQUE,
  response_reference VARCHAR(180) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, lesson_number),
  UNIQUE(lesson_number,response_reference)
);

CREATE TABLE training_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL CHECK(length(trim(question_text)) BETWEEN 10 AND 2000),
  created_by UUID REFERENCES admin_users(id),
  option_a TEXT NOT NULL CHECK(length(trim(option_a)) BETWEEN 1 AND 700),
  option_b TEXT NOT NULL CHECK(length(trim(option_b)) BETWEEN 1 AND 700),
  option_c TEXT NOT NULL CHECK(length(trim(option_c)) BETWEEN 1 AND 700),
  option_d TEXT NOT NULL CHECK(length(trim(option_d)) BETWEEN 1 AND 700),
  correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 1 AND 4),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK(approval_status IN ('draft','approved','archived')),
  approved_by UUID REFERENCES admin_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(approval_status <> 'approved' OR
    (created_by IS NOT NULL AND approved_by IS NOT NULL AND
     created_by <> approved_by AND approved_at IS NOT NULL))
);
CREATE INDEX idx_training_questions_approved ON training_questions(id)
  WHERE approval_status='approved';

CREATE TABLE training_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress','passed','failed','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  submitted_at TIMESTAMPTZ,
  correct_count SMALLINT CHECK(correct_count BETWEEN 0 AND 20),
  CHECK(expires_at > started_at),
  CHECK(
    (status IN ('in_progress','expired') AND submitted_at IS NULL AND correct_count IS NULL)
    OR
    (status IN ('passed','failed') AND submitted_at IS NOT NULL AND
     correct_count IS NOT NULL AND
     ((status='passed' AND correct_count >= 16) OR
      (status='failed' AND correct_count < 16)))
  )
);
CREATE UNIQUE INDEX idx_training_one_live_attempt ON training_attempts(learner_id)
  WHERE status='in_progress';

CREATE TABLE training_attempt_items (
  attempt_id UUID NOT NULL REFERENCES training_attempts(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK(position BETWEEN 1 AND 20),
  question_id UUID NOT NULL REFERENCES training_questions(id),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  -- Grading snapshots never returned from public API.
  correct_index SMALLINT NOT NULL CHECK(correct_index BETWEEN 1 AND 4),
  selected_index SMALLINT CHECK(selected_index BETWEEN 1 AND 4),
  PRIMARY KEY(attempt_id, position),
  UNIQUE(attempt_id,question_id)
);

COMMIT;

     AND approved_by IS NOT NULL
     AND published_at IS NOT NULL)
  )
);
-- Nine *unpublished slots*, not nine fabricated lessons.
INSERT INTO training_lessons(lesson_number)
SELECT generate_series(1,9);

CREATE TABLE training_learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  school_name VARCHAR(220) NOT NULL CHECK (length(trim(school_name)) BETWEEN 2 AND 220),
  privacy_acknowledged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  token_sha256 CHAR(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX idx_training_sessions_lookup ON training_sessions(token_sha256,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE training_verified_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  lesson_number SMALLINT NOT NULL CHECK (lesson_number IN (1,9)),
  provider_event_id VARCHAR(180) NOT NULL UNIQUE,
  response_reference VARCHAR(180) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, lesson_number),
  UNIQUE(lesson_number,response_reference)
);

CREATE TABLE training_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL CHECK(length(trim(question_text)) BETWEEN 10 AND 2000),
  created_by UUID REFERENCES admin_users(id),
  option_a TEXT NOT NULL CHECK(length(trim(option_a)) BETWEEN 1 AND 700),
  option_b TEXT NOT NULL CHECK(length(trim(option_b)) BETWEEN 1 AND 700),
  option_c TEXT NOT NULL CHECK(length(trim(option_c)) BETWEEN 1 AND 700),
  option_d TEXT NOT NULL CHECK(length(trim(option_d)) BETWEEN 1 AND 700),
  correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 1 AND 4),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK(approval_status IN ('draft','approved','archived')),
  approved_by UUID REFERENCES admin_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(approval_status <> 'approved' OR
    (created_by IS NOT NULL AND approved_by IS NOT NULL AND
     created_by <> approved_by AND approved_at IS NOT NULL))
);
CREATE INDEX idx_training_questions_approved ON training_questions(id)
  WHERE approval_status='approved';

CREATE TABLE training_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES training_learners(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress','passed','failed','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  submitted_at TIMESTAMPTZ,
  correct_count SMALLINT CHECK(correct_count BETWEEN 0 AND 20),
  CHECK(expires_at > started_at),
  CHECK(
    (status IN ('in_progress','expired') AND submitted_at IS NULL AND correct_count IS NULL)
    OR
    (status IN ('passed','failed') AND submitted_at IS NOT NULL AND
     correct_count IS NOT NULL AND
     ((status='passed' AND correct_count >= 16) OR
      (status='failed' AND correct_count < 16)))
  )
);
CREATE UNIQUE INDEX idx_training_one_live_attempt ON training_attempts(learner_id)
  WHERE status='in_progress';

CREATE TABLE training_attempt_items (
  attempt_id UUID NOT NULL REFERENCES training_attempts(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK(position BETWEEN 1 AND 20),
  question_id UUID NOT NULL REFERENCES training_questions(id),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  -- Grading snapshots never returned from public API.
  correct_index SMALLINT NOT NULL CHECK(correct_index BETWEEN 1 AND 4),
  selected_index SMALLINT CHECK(selected_index BETWEEN 1 AND 4),
  PRIMARY KEY(attempt_id, position),
  UNIQUE(attempt_id,question_id)
);

COMMIT;
