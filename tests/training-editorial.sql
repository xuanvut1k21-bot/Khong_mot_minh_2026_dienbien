-- Training editorial roles and state transitions. Synthetic only, always rolled back.
BEGIN;
DO $$
#variable_conflict use_variable
DECLARE
 editor_id UUID; reviewer_id UUID; tech_id UUID; v_question_id UUID;
 can_edit BOOLEAN; can_approve BOOLEAN; n INTEGER;
BEGIN
 INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
  VALUES('https://id.example.test','training_editor_008',TRUE)
  RETURNING id INTO editor_id;
 INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
  VALUES('https://id.example.test','training_approver_008',TRUE)
  RETURNING id INTO reviewer_id;
 INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
  VALUES('https://id.example.test','training_technical_008',TRUE)
  RETURNING id INTO tech_id;
 INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id)
  VALUES(editor_id,'training_editor','global',NULL),
    (reviewer_id,'training_approver','global',NULL),
    (tech_id,'technical_admin','global',NULL);

 SELECT EXISTS(
  SELECT 1 FROM admin_role_assignments a
  JOIN admin_role_permissions p ON p.role_code=a.role_code
  WHERE a.user_id=editor_id AND a.scope_type='global'
    AND p.resource='training_questions' AND p.action='edit'
 ) INTO can_edit;
 IF NOT can_edit THEN RAISE EXCEPTION 'Training editor permission missing'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM admin_role_assignments a
  JOIN admin_role_permissions p ON p.role_code=a.role_code
  WHERE a.user_id=tech_id AND p.resource='training_questions' AND p.action='approve'
 ) INTO can_approve;
 IF can_approve THEN RAISE EXCEPTION 'Technical admin got implicit approval'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM admin_role_assignments a
  JOIN admin_role_permissions p ON p.role_code=a.role_code
  WHERE a.user_id=editor_id AND p.resource='training_lessons' AND p.action='approve'
 ) INTO can_approve;
 IF can_approve THEN RAISE EXCEPTION 'Editor got own review permission'; END IF;

 UPDATE training_lessons SET title='Synthetic audited training lesson',
  approved_material_url='https://drive.google.com/file/d/123456789012345/view',
  editor_id=editor_id,updated_at=NOW() WHERE lesson_number=1;
 UPDATE training_lessons SET status='pending' WHERE lesson_number=1;
 BEGIN
  UPDATE training_lessons SET editor_id=reviewer_id,approved_by=reviewer_id,
  published_at=NOW(),status='published' WHERE lesson_number=1;
  RAISE EXCEPTION 'Self approved lesson accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE training_lessons SET approved_by=reviewer_id,
  status='published',published_at=NOW() WHERE lesson_number=1;
 SELECT COUNT(*) INTO n FROM training_lessons
  WHERE lesson_number=1 AND status='published';
 IF n<>1 THEN RAISE EXCEPTION 'Lesson not published'; END IF;
 UPDATE training_lessons SET status='draft',approved_by=NULL,
  published_at=NULL WHERE lesson_number=1;

 INSERT INTO training_questions(question_text,option_a,option_b,option_c,
  option_d,correct_index,created_by,source_reference)
 VALUES('Synthetic question on internet safety','A','B','C','D',2,editor_id,
  'https://drive.google.com/file/d/123456789012345/view')
 RETURNING id INTO v_question_id;
 UPDATE training_questions SET approval_status='pending' WHERE id=v_question_id;
 BEGIN
  UPDATE training_questions SET approval_status='approved',
   approved_by=editor_id,approved_at=NOW() WHERE id=v_question_id;
  RAISE EXCEPTION 'Self approved question accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE training_questions SET approval_status='approved',
  approved_by=reviewer_id,approved_at=NOW() WHERE id=v_question_id;
 SELECT COUNT(*) INTO n FROM training_questions
  WHERE id=v_question_id AND approval_status='approved';
 IF n<>1 THEN RAISE EXCEPTION 'Question approval failed'; END IF;
 UPDATE training_questions SET approval_status='archived' WHERE id=v_question_id;
 SELECT COUNT(*) INTO n FROM training_questions
  WHERE id=v_question_id AND approval_status='approved';
 IF n<>0 THEN RAISE EXCEPTION 'Archived question still in approved bank'; END IF;

 BEGIN
  INSERT INTO training_questions(question_text,option_a,option_b,option_c,
   option_d,correct_index,created_by,source_reference,approval_status)
  VALUES('Synthetic question with invalid provenance','A','B','C','D',1,editor_id,
   'https://example.com/unverified','pending');
  RAISE EXCEPTION 'Unapproved URL passed provenance check';
 EXCEPTION WHEN check_violation THEN NULL;
 END;

 INSERT INTO training_review_events(actor_id,lesson_number,action,from_status,to_status)
  VALUES(editor_id,1,'save','draft','draft');
 INSERT INTO training_review_events(actor_id,question_id,action,from_status,to_status)
  VALUES(reviewer_id,v_question_id,'archive','approved','archived');
 SELECT COUNT(*) INTO n FROM training_review_events
  WHERE question_id=v_question_id AND action='archive';
 IF n<>1 THEN RAISE EXCEPTION 'Review audit missing'; END IF;
 BEGIN
  INSERT INTO training_review_events(actor_id,lesson_number,question_id,action,to_status)
   VALUES(editor_id,1,v_question_id,'save','draft');
  RAISE EXCEPTION 'Ambiguous audit event accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
ROLLBACK;
