-- Training gates: only synthetic rows, no official curriculum/questions imported.
BEGIN;
DO $$
DECLARE
  v_admin UUID;v_learner UUID;v_attempt UUID;v_q UUID;
  v_count INTEGER;v_session UUID;
BEGIN
  SELECT COUNT(*) INTO v_count FROM training_lessons;
  IF v_count<>9 THEN RAISE EXCEPTION 'Exactly nine lesson slots required'; END IF;
  SELECT COUNT(*) INTO v_count FROM training_lessons WHERE status='published';
  IF v_count<>0 THEN RAISE EXCEPTION 'No lesson should be published by migration'; END IF;
  SELECT COUNT(*) INTO v_count FROM training_questions;
  IF v_count<>0 THEN RAISE EXCEPTION 'Question bank must start empty'; END IF;
  SELECT COUNT(*) INTO v_count FROM training_learners;
  IF v_count<>0 THEN RAISE EXCEPTION 'Do not seed learner personal data'; END IF;

  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','synthetic-training-reviewer',TRUE)
    RETURNING id INTO v_admin;
  UPDATE training_lessons SET
    title='Synthetic training material '||lesson_number,
    approved_material_url='https://drive.google.com/file/d/123456789012345/view',
    status='published',approved_by=v_admin,published_at=NOW();

  INSERT INTO training_learners(full_name,school_name,privacy_acknowledged_at)
    VALUES('Test Learner','Test School',NOW()) RETURNING id INTO v_learner;
  INSERT INTO training_sessions(learner_id,token_sha256,expires_at)
    VALUES(v_learner,repeat('a',64),NOW()+INTERVAL '30 days')
    RETURNING id INTO v_session;
  INSERT INTO training_verified_surveys(learner_id,lesson_number,provider_event_id,response_reference)
    VALUES(v_learner,1,'synthetic-event-one','synthetic-response-one');

  SELECT COUNT(*) INTO v_count FROM training_verified_surveys
    WHERE learner_id=v_learner AND lesson_number IN (1,9);
  IF v_count<>1 THEN RAISE EXCEPTION 'Only first survey should count'; END IF;

  BEGIN
    INSERT INTO training_verified_surveys(learner_id,lesson_number,provider_event_id,response_reference)
      VALUES(v_learner,1,'synthetic-duplicate','synthetic-response-other');
    RAISE EXCEPTION 'Repeated survey incorrectly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO training_verified_surveys(learner_id,lesson_number,provider_event_id,response_reference)
    VALUES(v_learner,9,'synthetic-event-nine','synthetic-response-nine');
  SELECT COUNT(*) INTO v_count FROM training_verified_surveys
    WHERE learner_id=v_learner AND lesson_number IN (1,9);
  IF v_count<>2 THEN RAISE EXCEPTION 'Survey gate is not fully satisfied'; END IF;

  INSERT INTO training_questions(question_text,option_a,option_b,option_c,option_d,
    correct_index,approval_status,approved_by,approved_at)
    SELECT 'Synthetic question number '||g,'Choice A','Choice B','Choice C','Choice D',
      (g%4)+1,'approved',v_admin,NOW()
    FROM generate_series(1,90) AS g;

  SELECT COUNT(*) INTO v_count FROM training_questions
    WHERE approval_status='approved';
  IF v_count<>90 THEN RAISE EXCEPTION 'Bank must contain exactly 90 reviewed questions'; END IF;

  INSERT INTO training_attempts(learner_id) VALUES(v_learner) RETURNING id INTO v_attempt;
  INSERT INTO training_attempt_items(
    attempt_id,position,question_id,question_text,option_a,option_b,option_c,option_d,correct_index
  )
  SELECT v_attempt,ROW_NUMBER() OVER(ORDER BY id),id,question_text,option_a,option_b,option_c,option_d,correct_index
  FROM (SELECT * FROM training_questions ORDER BY id LIMIT 20) q;

  SELECT COUNT(*) INTO v_count FROM training_attempt_items WHERE attempt_id=v_attempt;
  IF v_count<>20 THEN RAISE EXCEPTION 'A paper must have 20 questions'; END IF;
  BEGIN
    UPDATE training_attempts SET status='passed',correct_count=15,submitted_at=NOW()
      WHERE id=v_attempt;
    RAISE EXCEPTION '15/20 incorrectly passed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE training_attempts SET status='passed',correct_count=16,
    submitted_at=NOW() WHERE id=v_attempt;
  SELECT COUNT(*) INTO v_count FROM training_attempts
    WHERE id=v_attempt AND status='passed' AND correct_count=16;
  IF v_count<>1 THEN RAISE EXCEPTION 'Passing 16/20 failed'; END IF;

  BEGIN
    INSERT INTO training_attempt_items(attempt_id,position,question_id,question_text,
      option_a,option_b,option_c,option_d,correct_index)
      SELECT v_attempt,21,id,question_text,option_a,option_b,option_c,option_d,correct_index
      FROM training_questions LIMIT 1;
    RAISE EXCEPTION 'Question #21 incorrectly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
