-- Media curation and activity attachments. Apply after migrations 001-003.
-- Supports only manually reviewed Google Drive file links. No uploads or background sync.
BEGIN;
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS owner_organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS rights_holder VARCHAR(300),
  ADD COLUMN IF NOT EXISTS rights_basis TEXT,
  ADD COLUMN IF NOT EXISTS rights_evidence_ref VARCHAR(500),
  ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(1000);
ALTER TABLE media_assets ADD CONSTRAINT media_approved_separation
  CHECK (
    NOT is_public OR (
      source_type = 'drive' AND owner_organization_id IS NOT NULL
      AND created_by IS NOT NULL AND approved_by IS NOT NULL
      AND created_by <> approved_by
      AND NULLIF(TRIM(rights_holder),'') IS NOT NULL
      AND NULLIF(TRIM(rights_basis),'') IS NOT NULL
      AND NULLIF(TRIM(rights_evidence_ref),'') IS NOT NULL
    )
  );
CREATE INDEX IF NOT EXISTS idx_media_owner_status
  ON media_assets(owner_organization_id, approval_status, created_at DESC);

CREATE TABLE IF NOT EXISTS media_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id),
  actor_id UUID NOT NULL REFERENCES admin_users(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('create','approve','reject','revoke')),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_review_events_asset
  ON media_review_events(asset_id,created_at DESC);

CREATE TABLE IF NOT EXISTS activity_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id),
  media_asset_id UUID NOT NULL REFERENCES media_assets(id),
  link_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (link_status IN ('pending','approved','hidden')),
  linked_by UUID NOT NULL REFERENCES admin_users(id),
  reviewed_by UUID REFERENCES admin_users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(activity_id, media_asset_id),
  CONSTRAINT activity_asset_separate_reviewer CHECK (
    link_status <> 'approved' OR (
      reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by <> linked_by
    )
  )
);
CREATE INDEX IF NOT EXISTS idx_activity_assets_approved
  ON activity_assets(activity_id,media_asset_id)
  WHERE link_status='approved';
CREATE TABLE IF NOT EXISTS activity_asset_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES activity_assets(id),
  activity_id UUID NOT NULL REFERENCES activities(id),
  actor_id UUID NOT NULL REFERENCES admin_users(id),
  action VARCHAR(20) NOT NULL CHECK(action IN ('propose','approve','hide')),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_asset_events
  ON activity_asset_events(activity_id,created_at DESC);

COMMIT;
