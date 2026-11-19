-- 006: PDF and MP4 are preview-only. Originals remain private in quarantine.
-- No raw PDF document or video stream is exposed by this change.
BEGIN;

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS preview_type VARCHAR(24) DEFAULT 'image';
ALTER TABLE media_assets ADD CONSTRAINT media_preview_type_valid
  CHECK (preview_type IN ('image','pdf_cover','video_poster'));

ALTER TABLE media_assets DROP CONSTRAINT media_image_preview_invariant;
ALTER TABLE media_assets ADD CONSTRAINT media_upload_preview_invariant
  CHECK (
    preview_ready=FALSE OR (
      source_type='upload'
      AND scan_status='clean'
      AND preview_object_key LIKE 'processed/%'
      AND checksum_sha256 IS NOT NULL
      AND scanned_at IS NOT NULL
      AND (
        (preview_type='image' AND original_mime_type IN
          ('image/jpeg','image/png','image/webp')
          AND original_size_bytes BETWEEN 1 AND 10485760)
        OR
        (preview_type='pdf_cover' AND original_mime_type='application/pdf'
          AND original_size_bytes BETWEEN 1 AND 26214400)
        OR
        (preview_type='video_poster' AND original_mime_type='video/mp4'
          AND original_size_bytes BETWEEN 1 AND 83886080)
      )
    )
  );

ALTER TABLE media_upload_sessions
  DROP CONSTRAINT media_upload_sessions_expected_size_bytes_check;
ALTER TABLE media_upload_sessions
  DROP CONSTRAINT media_upload_sessions_expected_mime_type_check;
ALTER TABLE media_upload_sessions
  ADD CONSTRAINT media_upload_allowed_size
    CHECK (expected_size_bytes BETWEEN 1 AND 83886080),
  ADD CONSTRAINT media_upload_allowed_type_and_size CHECK (
    (expected_mime_type IN ('image/jpeg','image/png','image/webp')
      AND expected_size_bytes <= 10485760)
    OR (expected_mime_type='application/pdf'
      AND expected_size_bytes <= 26214400)
    OR (expected_mime_type='video/mp4'
      AND expected_size_bytes <= 83886080)
  );

COMMIT;
