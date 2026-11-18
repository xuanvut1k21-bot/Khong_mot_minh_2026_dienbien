-- Media approval and activity attachment verification. All sample rows rolled back.
BEGIN;
DO $$
DECLARE
  unit_id UUID; editor_id UUID; reviewer_id UUID; activity_id UUID;
  media_id UUID; link_id UUID; visible_count INTEGER;
BEGIN
  INSERT INTO organizations(public_name) VALUES('Synthetic media test unit')
    RETURNING id INTO unit_id;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','media-editor-test',TRUE)
    RETURNING id INTO editor_id;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://id.example.test','media-reviewer-test',TRUE)
    RETURNING id INTO reviewer_id;

  INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id)
    VALUES(editor_id,'media_editor','unit',unit_id),
      (reviewer_id,'media_approver','unit',unit_id),
      (editor_id,'activity_editor','unit',unit_id),
      (reviewer_id,'activity_approver','unit',unit_id);

  INSERT INTO activities(organization_id,slug,title,category_code,created_by,publish_status,published_at)
    VALUES(unit_id,'media-synthetic-activity','Synthetic campaign activity',
      'community',editor_id,'published',NOW())
    RETURNING id INTO activity_id;

  INSERT INTO media_assets(title,description,category_code,source_type,
    public_source_url,owner_organization_id,created_by)
    VALUES('Synthetic Drive media','Test metadata only','photo','drive',
      'https://drive.google.com/file/d/123456789012345/view',unit_id,editor_id)
    RETURNING id INTO media_id;

  SELECT COUNT(*) INTO visible_count FROM media_assets
    WHERE id=media_id AND approval_status='approved' AND is_public=TRUE;
  IF visible_count<>0 THEN RAISE EXCEPTION 'Pending media publicly visible'; END IF;

  BEGIN
    UPDATE media_assets SET is_public=TRUE WHERE id=media_id;
    RAISE EXCEPTION 'Public media without review passed constraints';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE media_assets SET approval_status='approved',is_public=TRUE,
    approved_by=reviewer_id,approved_at=NOW(),rights_checked_at=NOW(),
    privacy_checked_at=NOW(),safety_checked_at=NOW(),
    rights_holder='Test rights holder',
    rights_basis='Synthetic permission basis reviewed by a second operator',
    rights_evidence_ref='TEST-EVIDENCE-001'
    WHERE id=media_id;

  BEGIN
    UPDATE media_assets SET approved_by=editor_id WHERE id=media_id;
    RAISE EXCEPTION 'Self-approval passed database constraints';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO activity_assets(activity_id,media_asset_id,linked_by)
    VALUES(activity_id,media_id,editor_id) RETURNING id INTO link_id;
  SELECT COUNT(*) INTO visible_count FROM activity_assets
    WHERE id=link_id AND link_status='approved';
  IF visible_count<>0 THEN RAISE EXCEPTION 'Unapproved attachment visible'; END IF;

  BEGIN
    UPDATE activity_assets SET link_status='approved',
      reviewed_by=editor_id,reviewed_at=NOW() WHERE id=link_id;
    RAISE EXCEPTION 'Link self-approval passed constraints';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE activity_assets SET link_status='approved',
    reviewed_by=reviewer_id,reviewed_at=NOW() WHERE id=link_id;

  SELECT COUNT(*) INTO visible_count
  FROM activities a
  JOIN organizations ao ON ao.id=a.organization_id AND ao.active=TRUE
  JOIN activity_assets l ON l.activity_id=a.id AND l.link_status='approved'
  JOIN media_assets m ON m.id=l.media_asset_id
  JOIN organizations mo ON mo.id=m.owner_organization_id AND mo.active=TRUE
  WHERE a.id=activity_id AND a.publish_status='published'
    AND a.published_at<=NOW()
    AND m.approval_status='approved' AND m.is_public=TRUE
    AND m.rights_checked_at IS NOT NULL
    AND m.privacy_checked_at IS NOT NULL AND m.safety_checked_at IS NOT NULL;
  IF visible_count<>1 THEN RAISE EXCEPTION 'Approved attachment not visible'; END IF;

  UPDATE media_assets SET approval_status='revoked',is_public=FALSE WHERE id=media_id;
  SELECT COUNT(*) INTO visible_count FROM activity_assets l
  JOIN media_assets m ON m.id=l.media_asset_id
  WHERE l.id=link_id AND l.link_status='approved'
    AND m.approval_status='approved' AND m.is_public=TRUE;
  IF visible_count<>0 THEN RAISE EXCEPTION 'Revoked media remains publicly linked'; END IF;

  UPDATE activity_assets SET link_status='hidden' WHERE id=link_id;
  INSERT INTO media_review_events(asset_id,actor_id,action,from_status,to_status,note)
    VALUES(media_id,reviewer_id,'revoke','approved','revoked','Synthetic test only');
  INSERT INTO activity_asset_events(link_id,activity_id,actor_id,action,from_status,to_status)
    VALUES(link_id,activity_id,reviewer_id,'hide','approved','hidden');
END $$;
ROLLBACK;
