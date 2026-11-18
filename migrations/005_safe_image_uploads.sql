-- Secure image-only upload pipeline. Apply after 001-004.
-- Private quarantine objects are NOT public media. No automatic publication.
BEGIN;

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS scan_status VARCHAR(24) NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS preview_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preview_object_key TEXT,
  ADD COLUMN IF NOT EXISTS original_mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;

ALTER TABLE media_assets ADD CONSTRAINT media_scan_status_valid
  CHECK (scan_status IN ('not_applicable','pending','clean','rejected','error'));
ALTER TABLE media_assets ADD CONSTRAINT media_image_preview_invariant
  CHECK (
    preview_ready=FALSE OR (
      source_type='upload' AND scan_status='clean'
      AND preview_object_key LIKE 'processed/%'
      AND checksum_sha256 IS NOT NULL
      AND original_size_bytes BETWEEN 1 AND 10485760
      AND original_mime_type IN ('image/jpeg','image/png','image/webp')
      AND scanned_at IS NOT NULL
    )
  );

ALTER TABLE media_assets DROP CONSTRAINT media_approved_separation;
ALTER TABLE media_assets ADD CONSTRAINT media_approved_separation CHECK (
  NOT is_public OR (
    owner_organization_id IS NOT NULL
    AND created_by IS NOT NULL
    AND approved_by IS NOT NULL AND approved_by <> created_by
    AND NULLIF(TRIM(rights_holder),'') IS NOT NULL
    AND NULLIF(TRIM(rights_basis),'') IS NOT NULL
    AND NULLIF(TRIM(rights_evidence_ref),'') IS NOT NULL
    AND (
      source_type='drive'
      OR (
        source_type='upload' AND scan_status='clean' AND preview_ready=TRUE
        AND preview_object_key LIKE 'processed/%'
        AND checksum_sha256 IS NOT NULL
      )
    )
  )
);

CREATE TABLE IF NOT EXISTS media_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES admin_users(id),
  object_key TEXT NOT NULL UNIQUE,
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes BETWEEN 1 AND 10485760),
  expected_mime_type VARCHAR(100) NOT NULL CHECK (
    expected_mime_type IN ('image/jpeg','image/png','image/webp')
  ),
  state VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (
    state IN ('initiated','uploaded','scanning','accepted','rejected','failed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  scan_token UUID,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_failure_code VARCHAR(60),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_media_upload_ready
  ON media_upload_sessions(state,expires_at,lease_expires_at)
  WHERE state IN ('uploaded','scanning');

COMMIT;
