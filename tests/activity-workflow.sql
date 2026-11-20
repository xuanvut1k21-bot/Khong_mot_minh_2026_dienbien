BEGIN;
DO $$
DECLARE
  v_unit_a UUID; v_unit_b UUID;
  v_author UUID; v_reviewer UUID; v_other UUID; v_activity UUID;
  v_allowed BOOLEAN; v_n INTEGER;
BEGIN
  INSERT INTO organizations(public_name) VALUES('Test unit A') RETURNING id INTO v_unit_a;
  INSERT INTO organizations(public_name) VALUES('Test unit B') RETURNING id INTO v_unit_b;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','author-activity',TRUE) RETURNING id INTO v_author;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','reviewer-activity',TRUE) RETURNING id INTO v_reviewer;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','other-activity',TRUE) RETURNING id INTO v_other;
  INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id)
    VALUES(v_author,'activity_editor','unit',v_unit_a),
          (v_reviewer,'activity_approver','unit',v_unit_a),
          (v_other,'activity_editor','unit',v_unit_b);

  SELECT EXISTS(
    SELECT 1 FROM admin_role_assignments r
    JOIN admin_role_permissions p ON p.role_code=r.role_code
    WHERE r.user_id=v_author AND p.resource='activities' AND p.action='edit'
      AND r.scope_type='unit' AND r.scope_id=v_unit_a
  ) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Expected own-unit editor permission'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM admin_role_assignments r
    JOIN admin_role_permissions p ON p.role_code=r.role_code
    WHERE r.user_id=v_other AND p.resource='activities' AND p.action='edit'
      AND (r.scope_type='global' OR (r.scope_type='unit' AND r.scope_id=v_unit_a))
  ) INTO v_allowed;
  IF v_allowed THEN RAISE EXCEPTION 'Cross-unit editor allowed'; END IF;

  INSERT INTO activities(organization_id,slug,title,summary,category_code,starts_at,created_by)
    VALUES(v_unit_a,'test-only-activity','Test activity','Synthetic event',
           'workshop',NOW()-INTERVAL '1 day',v_author) RETURNING id INTO v_activity;
  SELECT COUNT(*) INTO v_n FROM activities a
    WHERE a.id=v_activity AND a.publish_status='published';
  IF v_n<>0 THEN RAISE EXCEPTION 'Draft activity exposed'; END IF;

  UPDATE activities SET publish_status='pending',submitted_by=v_author WHERE id=v_activity;
  UPDATE activities SET publish_status='approved',approved_by=v_reviewer WHERE id=v_activity;
  UPDATE activities SET publish_status='published',published_by=v_reviewer,
    published_at=NOW(),event_status='completed' WHERE id=v_activity;
  INSERT INTO activity_results(activity_id,result_status,sessions_count,attendance_count,summary,entered_by)
    VALUES(v_activity,'draft',1,20,'Synthetic count only',v_author);

  SELECT COUNT(*) INTO v_n FROM activities a
    JOIN activity_results r ON r.activity_id=a.id
    WHERE a.id=v_activity AND r.result_status='verified';
  IF v_n<>0 THEN RAISE EXCEPTION 'Unverified result exposed'; END IF;

  UPDATE activity_results SET result_status='verified',verified_by=v_reviewer,verified_at=NOW()
    WHERE activity_id=v_activity;
  SELECT COUNT(*) INTO v_n FROM activities a
    JOIN activity_results r ON r.activity_id=a.id
    WHERE a.id=v_activity AND a.publish_status='published'
      AND a.event_status='completed' AND r.result_status='verified'
      AND r.verified_by<>r.entered_by;
  IF v_n<>1 THEN RAISE EXCEPTION 'Verified result missing'; END IF;

  BEGIN
    UPDATE activity_results SET verified_by=v_author WHERE activity_id=v_activity;
    RAISE EXCEPTION 'Self verification was not blocked';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO activity_review_events(activity_id,actor_id,action,from_status,to_status)
    VALUES(v_activity,v_author,'create',NULL,'draft');
  SELECT COUNT(*) INTO v_n FROM activity_review_events e
    WHERE e.activity_id=v_activity AND e.action='create';
  IF v_n<>1 THEN RAISE EXCEPTION 'Review audit missing'; END IF;
END $$;
ROLLBACK;
