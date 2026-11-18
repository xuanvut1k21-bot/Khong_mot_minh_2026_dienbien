-- PostgreSQL 16+ RBAC safety checks, synthetic data only, all rolled back.
BEGIN;
DO $$
DECLARE
  editor_id UUID;
  tech_id UUID;
  unit_a UUID;
  unit_b UUID;
  allowed BOOLEAN;
  count_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_users FROM admin_users;
  IF count_users <> 0 THEN RAISE EXCEPTION 'No admin users should be seeded'; END IF;
  INSERT INTO organizations(public_name) VALUES ('Test A') RETURNING id INTO unit_a;
  INSERT INTO organizations(public_name) VALUES ('Test B') RETURNING id INTO unit_b;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test/','subject-editor',TRUE) RETURNING id INTO editor_id;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test/','subject-tech',TRUE) RETURNING id INTO tech_id;
  INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id)
    VALUES (editor_id,'activity_editor','unit',unit_a),
           (tech_id,'technical_admin','global',NULL);

  SELECT EXISTS (
    SELECT 1 FROM admin_role_assignments a JOIN admin_role_permissions p USING (role_code)
    WHERE a.user_id=editor_id AND p.resource='activities' AND p.action='edit'
      AND a.scope_type='unit' AND a.scope_id=unit_a
  ) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'Editor should edit own unit'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM admin_role_assignments a JOIN admin_role_permissions p USING (role_code)
    WHERE a.user_id=editor_id AND p.resource='activities' AND p.action='edit'
      AND (a.scope_type='global' OR (a.scope_type='unit' AND a.scope_id=unit_b))
  ) INTO allowed;
  IF allowed THEN RAISE EXCEPTION 'Editor leaked across units'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM admin_role_assignments a JOIN admin_role_permissions p USING (role_code)
    WHERE a.user_id=editor_id AND p.resource='activities' AND p.action='approve'
  ) INTO allowed;
  IF allowed THEN RAISE EXCEPTION 'Editor unexpectedly approved activities'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM admin_role_assignments a JOIN admin_role_permissions p USING (role_code)
    WHERE a.user_id=tech_id AND p.resource='media' AND p.action='approve'
  ) INTO allowed;
  IF allowed THEN RAISE EXCEPTION 'Technical admin implicitly gained media approval'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM admin_role_assignments a JOIN admin_role_permissions p USING (role_code)
    WHERE a.user_id=tech_id AND p.resource='admin_users' AND p.action='manage'
  ) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'Technical role missing intended permission'; END IF;

  BEGIN
    INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id)
      VALUES(editor_id,'activity_editor','unit',NULL);
    RAISE EXCEPTION 'Non-global assignment without a scope should be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO admin_sessions(user_id,token_sha256,expires_at)
    VALUES(editor_id, repeat('a',64), NOW()+INTERVAL '1 hour');
  UPDATE admin_sessions SET revoked_at=NOW() WHERE user_id=editor_id;
  SELECT EXISTS(
    SELECT 1 FROM admin_sessions
    WHERE user_id=editor_id AND revoked_at IS NULL AND expires_at>NOW()
  ) INTO allowed;
  IF allowed THEN RAISE EXCEPTION 'Revoked session remains active'; END IF;
END $$;
ROLLBACK;
