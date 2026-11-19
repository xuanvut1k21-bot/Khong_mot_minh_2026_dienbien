BEGIN;
DO $$
DECLARE
  v_unit UUID; v_editor UUID; v_approver UUID;
  v_pdf UUID; v_mp4 UUID; v_session UUID; v_count INTEGER;
  v_hash CHAR(64):=repeat('b',64);
BEGIN
  INSERT INTO organizations(public_name)
    VALUES('Synthetic preview unit') RETURNING id INTO v_unit;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://test.example','pdf-editor',TRUE) RETURNING id INTO v_editor;
  INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled)
    VALUES('https://test.example','pdf-approver',TRUE) RETURNING id INTO v_approver;
  INSERT INTO media_assets(title,category_code,source_type,
      owner_organization_id,created_by,scan_status,preview_type)
    VALUES('Test PDF cover','handbook','upload',v_unit,v_editor,'pending','pdf_cover')
    RETURNING id INTO v_pdf;
  INSERT INTO media_upload_sessions(asset_id,uploader_id,object_key,
      expected_size_bytes,expected_mime_type,expires_at)
    VALUES(v_pdf,v_editor,'quarantine/'||v_pdf::text||'/test-pdf',20000,
      'application/pdf',NOW()+INTERVAL '90 seconds') RETURNING id INTO v_session;

  BEGIN
    UPDATE media_assets SET preview_ready=TRUE WHERE id=v_pdf;
    RAISE EXCEPTION 'An unscanned PDF cover could be marked ready';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE media_upload_sessions SET expected_size_bytes=26214401 WHERE id=v_session;
    RAISE EXCEPTION 'Oversized PDF was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE media_upload_sessions SET expected_mime_type='text/html' WHERE id=v_session;
    RAISE EXCEPTION 'HTML was accepted as an upload';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE media_assets SET scan_status='clean',preview_ready=TRUE,
    preview_type='pdf_cover',original_mime_type='application/pdf',
    original_size_bytes=20000,checksum_sha256=v_hash,
    preview_object_key='processed/'||v_pdf::text||'/'||v_hash||'.webp',
    scanned_at=NOW() WHERE id=v_pdf;
  BEGIN
    UPDATE media_assets SET original_mime_type='video/mp4' WHERE id=v_pdf;
    RAISE EXCEPTION 'MIME mismatch for a PDF preview was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_pdf AND scan_status='clean' AND preview_ready=TRUE AND is_public=FALSE;
  IF v_count<>1 THEN RAISE EXCEPTION 'Ready PDF preview should remain private'; END IF;

  UPDATE media_assets SET approval_status='approved',is_public=TRUE,
    approved_by=v_approver,approved_at=NOW(),rights_checked_at=NOW(),
    privacy_checked_at=NOW(),safety_checked_at=NOW(),
    rights_holder='Synthetic owner',
    rights_basis='Synthetic permission evidence',
    rights_evidence_ref='TEST-PDF-001' WHERE id=v_pdf;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_pdf AND approval_status='approved' AND is_public=TRUE;
  IF v_count<>1 THEN RAISE EXCEPTION 'Approved PDF cover was not visible'; END IF;

  INSERT INTO media_assets(title,category_code,source_type,
      owner_organization_id,created_by,scan_status,preview_type)
    VALUES('Test video poster','video','upload',v_unit,v_editor,'pending','video_poster')
    RETURNING id INTO v_mp4;
  INSERT INTO media_upload_sessions(asset_id,uploader_id,object_key,
      expected_size_bytes,expected_mime_type,expires_at)
    VALUES(v_mp4,v_editor,'quarantine/'||v_mp4::text||'/test-video',
      70000000,'video/mp4',NOW()+INTERVAL '90 seconds');
  UPDATE media_assets SET scan_status='clean',preview_ready=TRUE,
    original_mime_type='video/mp4',original_size_bytes=70000000,
    checksum_sha256=v_hash,scanned_at=NOW(),
    preview_object_key='processed/'||v_mp4::text||'/'||v_hash||'.webp'
    WHERE id=v_mp4;

  UPDATE media_assets SET approval_status='approved',is_public=TRUE,
    approved_by=v_approver,approved_at=NOW(),rights_checked_at=NOW(),
    privacy_checked_at=NOW(),safety_checked_at=NOW(),
    rights_holder='Synthetic owner',
    rights_basis='Synthetic permission evidence',
    rights_evidence_ref='TEST-MP4-001' WHERE id=v_mp4;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_mp4 AND approval_status='approved' AND is_public=TRUE
      AND preview_type='video_poster' AND original_mime_type='video/mp4';
  IF v_count<>1 THEN RAISE EXCEPTION 'Video poster did not satisfy preview invariants'; END IF;
  UPDATE media_assets SET approval_status='revoked',is_public=FALSE WHERE id=v_mp4;
  SELECT COUNT(*) INTO v_count FROM media_assets
    WHERE id=v_mp4 AND approval_status='approved' AND is_public=TRUE;
  IF v_count<>0 THEN RAISE EXCEPTION 'Revoked video poster remained public'; END IF;
END $$;
ROLLBACK;
