BEGIN;
DO $$
DECLARE
  org_id UUID; act_id UUID; media_id UUID; count_public INTEGER;
BEGIN
  INSERT INTO organizations(public_name) VALUES ('Test unit') RETURNING id INTO org_id;
  INSERT INTO activities(organization_id,slug,title,category_code,publish_status)
    VALUES(org_id,'sample-unpublished','Draft test activity','workshop','draft') RETURNING id INTO act_id;

  SELECT COUNT(*) INTO count_public FROM activities
    WHERE publish_status='published' AND published_at IS NOT NULL AND published_at<=NOW();
  IF count_public<>0 THEN RAISE EXCEPTION 'Draft activity exposed'; END IF;

  UPDATE activities SET publish_status='published',published_at=NOW() WHERE id=act_id;
  INSERT INTO activity_results(activity_id,result_status,attendance_count)
    VALUES(act_id,'draft',50);
  SELECT COUNT(*) INTO count_public FROM activity_results
    WHERE activity_id=act_id AND result_status='verified' AND verified_at IS NOT NULL;
  IF count_public<>0 THEN RAISE EXCEPTION 'Unverified result exposed'; END IF;

  UPDATE activity_results SET result_status='verified',verified_at=NOW() WHERE activity_id=act_id;
  SELECT COUNT(*) INTO count_public FROM activity_results
    WHERE activity_id=act_id AND result_status='verified' AND verified_at<=NOW();
  IF count_public<>1 THEN RAISE EXCEPTION 'Verified result missing'; END IF;

  INSERT INTO media_assets(title,category_code,source_type,public_source_url)
    VALUES('Draft media','photo','drive','https://drive.google.com/file/d/123456789012345/view')
    RETURNING id INTO media_id;
  BEGIN
    UPDATE media_assets SET is_public=TRUE WHERE id=media_id;
    RAISE EXCEPTION 'Public media constraint missing';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE media_assets
    SET approval_status='approved', approved_at=NOW(),
        rights_checked_at=NOW(),privacy_checked_at=NOW(),
        safety_checked_at=NOW(),is_public=TRUE
    WHERE id=media_id;
  SELECT COUNT(*) INTO count_public FROM media_assets
    WHERE id=media_id AND is_public AND approval_status='approved';
  IF count_public<>1 THEN RAISE EXCEPTION 'Approved media missing'; END IF;
END $$;
ROLLBACK;
