-- Operational rate-limit invariants (synthetic data; always ROLLBACK).
BEGIN;
DO $$
DECLARE
  v_learner UUID; v_used INTEGER;
BEGIN
  INSERT INTO training_learners(full_name,school_name,privacy_acknowledged_at)
  VALUES('Synthetic Budget Learner','Synthetic Budget School',NOW())
  RETURNING id INTO v_learner;
  INSERT INTO training_registration_limits(bucket_key,window_started_at,used)
  VALUES('global',NOW(),300);
  BEGIN
    UPDATE training_registration_limits SET used=301 WHERE bucket_key='global';
    RAISE EXCEPTION 'Global registration budget can overflow 300';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE training_registration_limits SET
    window_started_at=NOW()-INTERVAL '11 minutes';
  INSERT INTO training_registration_limits(bucket_key,window_started_at,used)
    VALUES('global',NOW(),1)
    ON CONFLICT(bucket_key) DO UPDATE SET
    used=CASE WHEN training_registration_limits.window_started_at<=NOW()-INTERVAL '10 minutes'
      THEN 1 ELSE training_registration_limits.used+1 END,
    window_started_at=CASE WHEN training_registration_limits.window_started_at<=NOW()-INTERVAL '10 minutes'
      THEN NOW() ELSE training_registration_limits.window_started_at END
    WHERE training_registration_limits.window_started_at<=NOW()-INTERVAL '10 minutes'
      OR training_registration_limits.used < 300
    RETURNING used INTO v_used;
  IF v_used<>1 THEN RAISE EXCEPTION 'Global budget did not reset after 10 minutes'; END IF;

  INSERT INTO training_learner_rate_limits(learner_id,action,window_started_at,used)
  VALUES(v_learner,'exam_start',NOW(),12);
  BEGIN
    UPDATE training_learner_rate_limits SET used=31 WHERE learner_id=v_learner;
    RAISE EXCEPTION 'Learner budget can exceed maximum';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO training_learner_rate_limits(learner_id,action,used)
    VALUES(v_learner,'unrecognized_action',1);
    RAISE EXCEPTION 'Unknown action allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE training_learner_rate_limits SET window_started_at=NOW()-INTERVAL '2 minutes';
  INSERT INTO training_learner_rate_limits(learner_id,action,window_started_at,used)
    VALUES(v_learner,'exam_start',NOW(),1)
    ON CONFLICT(learner_id,action) DO UPDATE SET
    used=CASE WHEN training_learner_rate_limits.window_started_at<=NOW()-INTERVAL '1 minute'
      THEN 1 ELSE training_learner_rate_limits.used+1 END,
    window_started_at=CASE WHEN training_learner_rate_limits.window_started_at<=NOW()-INTERVAL '1 minute'
      THEN NOW() ELSE training_learner_rate_limits.window_started_at END
    WHERE training_learner_rate_limits.window_started_at<=NOW()-INTERVAL '1 minute'
      OR training_learner_rate_limits.used < 12
    RETURNING used INTO v_used;
  IF v_used<>1 THEN RAISE EXCEPTION 'Learner budget did not reset'; END IF;

  DELETE FROM training_learners WHERE id=v_learner;
  IF EXISTS(SELECT 1 FROM training_learner_rate_limits WHERE learner_id=v_learner)
  THEN RAISE EXCEPTION 'Rate budget survived learner deletion'; END IF;
END $$;
ROLLBACK;
