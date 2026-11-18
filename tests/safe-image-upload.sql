-- Safe-image upload schema invariants. Only synthetic records, always ROLLBACK.
BEGIN;
DO $$
DECLARE
  v_unit UUID;v_editor UUID;v_reviewer UUID;v_media UUID;v_session UUID;
  v_count INTEGER;v_checksum CHAR(64):=repeat('a',64);
BEGIN
  INSERT INTO organizations(public_name) VALUES('Synthetic upload unit')
    RETURNING id INTO v_unit;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://example.test','image-uploader',TRUE) RETURNING id INTO v_editor;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://example.test','image-reviewer',TRUE) RETURNING id INTO v_reviewer;

  INSERT INTO media_assets(title,category_code,source_type,
    owner_organization_id,created_by,scan_status)
    VALUES('Synthetic image','photo','upload',v_unit,v_editor,'pending')
    RETURNING id INTO v_media;
  INSERT INTO media_upload_sessions(asset_id,uploader_id,object_key,
    expected_size_bytes,expected_mime_type,expires_at)
    VALUES(v_media,v_editor,'quarantine/'||v_media::text||'/test-only',
      4000,'image/png',NOW()+INTERVAL '90 seconds')
    RETURNING id INTO v_session;

  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_media AND is_public=TRUE;
  IF v_count<>0 THEN RAISE EXCEPTION 'Unscanned media visible'; END IF;

  BEGIN
    UPDATE media_assets SET preview_ready=TRUE WHERE id=v_media;
    RAISE EXCEPTION 'Unscanned preview was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE media_assets SET approval_status='approved',is_public=TRUE,
      approved_by=v_reviewer,approved_at=NOW(),rights_checked_at=NOW(),
      privacy_checked_at=NOW(),safety_checked_at=NOW(),
      rights_holder='Owner',rights_basis='Synthetic permission',rights_evidence_ref='TEST'
      WHERE id=v_media;
    RAISE EXCEPTION 'Unscanned original was allowed to publish';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE media_assets SET scan_status='clean',
    preview_ready=TRUE,preview_object_key='processed/'||v_media::text||'/'||v_checksum||'.webp',
    original_size_bytes=4000,original_mime_type='image/png',
    checksum_sha256=v_checksum,scanned_at=NOW()
    WHERE id=v_media;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_media AND scan_status='clean' AND preview_ready=TRUE
      AND is_public=FALSE;
  IF v_count<>1 THEN RAISE EXCEPTION 'Scanned preview was not retained as private'; END IF;

  BEGIN
    UPDATE media_assets SET approval_status='approved',is_public=TRUE,
      approved_by=v_editor,approved_at=NOW(),rights_checked_at=NOW(),
      privacy_checked_at=NOW(),safety_checked_at=NOW(),
      rights_holder='Owner',rights_basis='Synthetic permission',rights_evidence_ref='TEST'
      WHERE id=v_media;
    RAISE EXCEPTION 'Self approval of upload was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE media_assets SET approval_status='approved',is_public=TRUE,
    approved_by=v_reviewer,approved_at=NOW(),rights_checked_at=NOW(),
    privacy_checked_at=NOW(),safety_checked_at=NOW(),
    rights_holder='Owner',rights_basis='Synthetic permission',rights_evidence_ref='TEST'
    WHERE id=v_media;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_media AND approval_status='approved' AND is_public=TRUE
      AND scan_status='clean' AND preview_ready=TRUE;
  IF v_count<>1 THEN RAISE EXCEPTION 'Reviewed image could not be published'; END IF;

  UPDATE media_assets SET approval_status='revoked',is_public=FALSE WHERE id=v_media;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_media AND approval_status='approved' AND is_public=TRUE;
  IF v_count<>0 THEN RAISE EXCEPTION 'Revoked image still public'; END IF;

  BEGIN
    UPDATE media_upload_sessions SET expected_size_bytes=10485761 WHERE id=v_session;
    RAISE EXCEPTION 'Oversized image session accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
