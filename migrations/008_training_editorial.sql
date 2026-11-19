-- 008: Scoped-by-global-permission editorial workflow for training curriculum.
-- No real course content, students or question answers seeded.
BEGIN;
INSERT INTO admin_roles(code,description) VALUES
 ('training_editor','Create and submit course lessons/questions for independent review'),
 ('training_approver','Approve, withdraw and archive approved training content')
ON CONFLICT(code) DO NOTHING;

INSERT INTO admin_permissions(resource,action) VALUES
 ('training_lessons','view'),('training_lessons','edit'),('training_lessons','approve'),
 ('training_questions','view'),('training_questions','edit'),('training_questions','approve')
ON CONFLICT(resource,action) DO NOTHING;

INSERT INTO admin_role_permissions(role_code,resource,action) VALUES
 ('training_editor','training_lessons','view'),
 ('training_editor','training_lessons','edit'),
 ('training_editor','training_questions','view'),
 ('training_editor','training_questions','edit'),
 ('training_approver','training_lessons','view'),
 ('training_approver','training_lessons','approve'),
 ('training_approver','training_questions','view'),
 ('training_approver','training_questions','approve')
ON CONFLICT(role_code,resource,action) DO NOTHING;

ALTER TABLE training_lessons
  ADD COLUMN editor_id UUID REFERENCES admin_users(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE training_lessons DROP CONSTRAINT training_lessons_status_check;
ALTER TABLE training_lessons ADD CONSTRAINT training_lessons_status_check
  CHECK(status IN ('draft','pending','published'));
ALTER TABLE training_lessons DROP CONSTRAINT training_lessons_check;
ALTER TABLE training_lessons ADD CONSTRAINT training_lesson_published_valid
  CHECK (status <> 'published' OR (
    editor_id IS NOT NULL AND approved_by IS NOT NULL AND editor_id <> approved_by
    AND title IS NOT NULL AND length(trim(title)) >= 3
    AND approved_material_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{15,128}/view/?$'
    AND published_at IS NOT NULL
  ));
ALTER TABLE training_lessons ADD CONSTRAINT training_lesson_pending_valid
  CHECK(status <> 'pending' OR (
    editor_id IS NOT NULL AND title IS NOT NULL AND length(trim(title)) >= 3
    AND approved_material_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{15,128}/view/?$'
  ));

ALTER TABLE training_questions
  ADD COLUMN source_reference TEXT,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE training_questions DROP CONSTRAINT training_questions_approval_status_check;
ALTER TABLE training_questions ADD CONSTRAINT training_questions_approval_status_check
  CHECK(approval_status IN ('draft','pending','approved','archived'));
ALTER TABLE training_questions ADD CONSTRAINT training_question_source_valid
  CHECK (source_reference IS NULL OR
   source_reference ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{15,128}/view/?$');
ALTER TABLE training_questions ADD CONSTRAINT training_question_pending_valid
  CHECK(approval_status <> 'pending' OR
    (created_by IS NOT NULL AND source_reference IS NOT NULL));
ALTER TABLE training_questions ADD CONSTRAINT training_question_approved_source_valid
  CHECK(approval_status <> 'approved' OR source_reference IS NOT NULL);

CREATE TABLE training_review_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID NOT NULL REFERENCES admin_users(id),
 lesson_number SMALLINT REFERENCES training_lessons(lesson_number),
 question_id UUID REFERENCES training_questions(id),
 action VARCHAR(32) NOT NULL CHECK(action IN
   ('save','submit','return','publish','withdraw','create','approve','archive')),
 from_status VARCHAR(24),
 to_status VARCHAR(24) NOT NULL,
 note VARCHAR(500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((lesson_number IS NULL) <> (question_id IS NULL))
);
CREATE INDEX idx_training_review_lesson ON training_review_events(lesson_number,created_at DESC)
  WHERE lesson_number IS NOT NULL;
CREATE INDEX idx_training_review_question ON training_review_events(question_id,created_at DESC)
  WHERE question_id IS NOT NULL;
COMMIT;
