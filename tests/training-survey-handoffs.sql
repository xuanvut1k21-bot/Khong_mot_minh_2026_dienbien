-- Survey handoff integrity, no real user records. Everything rolled back.
BEGIN;
DO $$
DECLARE
  v_learner UUID; v_handoff1 UUID; v_handoff9 UUID; v_verified UUID; v_count INTEGER;
BEGIN
  INSERT INTO training_learners(full_name,school_name,privacy_acknowledged_at)
  VALUES('Synthetic Survey Learner','Synthetic Survey School',NOW())
  RETURNING id INTO v_learner;

  INSERT INTO training_survey_handoffs(learner_id,lesson_number,token_sha256,expires_at)
  VALUES(v_learner,1,repeat('a',64),NOW()+INTERVAL '2 hours')
  RETURNING id INTO v_handoff1;

  INSERT INTO training_verified_surveys(
    learner_id,lesson_number,provider_event_id,response_reference,handoff_id
  )VALUES(v_learner,1,'synthetic-event-lesson1','synthetic-response-lesson1',v_handoff1)
  RETURNING id INTO v_verified;
  UPDATE training_survey_handoffs SET consumed_at=NOW() WHERE id=v_handoff1;
  SELECT COUNT(*) INTO v_count FROM training_verified_surveys
    WHERE learner_id=v_learner AND lesson_number=1 AND handoff_id=v_handoff1;
  IF v_count<>1 THEN RAISE EXCEPTION 'Signed handoff correlation was not retained'; END IF;

  BEGIN
    INSERT INTO training_verified_surveys(
      learner_id,lesson_number,provider_event_id,response_reference,handoff_id
    ) VALUES(v_learner,1,'other-event','other-response',v_handoff1);
    RAISE EXCEPTION 'Same survey lesson was verified twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO training_survey_handoffs(
      learner_id,lesson_number,token_sha256,expires_at
    ) VALUES(v_learner,1,repeat('a',64),NOW()+INTERVAL '2 hours');
    RAISE EXCEPTION 'Duplicate correlation digest was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO training_survey_handoffs(
      learner_id,lesson_number,token_sha256,expires_at
    ) VALUES(v_learner,7,repeat('b',64),NOW()+INTERVAL '2 hours');
    RAISE EXCEPTION 'Lesson 7 incorrectly accepted a survey handoff';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO training_survey_handoffs(
      learner_id,lesson_number,token_sha256,expires_at
    ) VALUES(v_learner,9,repeat('b',64),NOW()-INTERVAL '1 minute');
    RAISE EXCEPTION 'Expired-at-creation handoff incorrectly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO training_survey_handoffs(learner_id,lesson_number,token_sha256,expires_at)
  VALUES(v_learner,9,repeat('c',64),NOW()+INTERVAL '2 hours')
  RETURNING id INTO v_handoff9;
  INSERT INTO training_verified_surveys(
    learner_id,lesson_number,provider_event_id,response_reference,handoff_id
  )VALUES(v_learner,9,'synthetic-event-lesson9','synthetic-response-lesson9',v_handoff9);
  UPDATE training_survey_handoffs SET consumed_at=NOW() WHERE id=v_handoff9;

  SELECT COUNT(*) INTO v_count FROM training_verified_surveys
    WHERE learner_id=v_learner AND lesson_number IN(1,9)
    AND handoff_id IS NOT NULL;
  IF v_count<>2 THEN RAISE EXCEPTION 'Two verified survey handoffs are required'; END IF;

  DELETE FROM training_learners WHERE id=v_learner;
  SELECT COUNT(*) INTO v_count FROM training_survey_handoffs
    WHERE id IN(v_handoff1,v_handoff9);
  IF v_count<>0 THEN RAISE EXCEPTION 'Deletion did not cascade to handoffs'; END IF;
  SELECT COUNT(*) INTO v_count FROM training_verified_surveys
    WHERE id=v_verified;
  IF v_count<>0 THEN RAISE EXCEPTION 'Deletion did not remove survey result'; END IF;
END $$;
ROLLBACK;
