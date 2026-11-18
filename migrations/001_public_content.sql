-- Initial PostgreSQL schema for moderated public content, no seed/sample data.
BEGIN;
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_name VARCHAR(220) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  slug VARCHAR(160) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title VARCHAR(300) NOT NULL CHECK (length(trim(title)) > 2),
  summary TEXT NOT NULL DEFAULT '',
  category_code VARCHAR(30) NOT NULL CHECK (category_code IN ('workshop','five_minutes','training','ambassador','community')),
  event_status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (event_status IN ('planned','completed','postponed','cancelled')),
  publish_status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft','pending','approved','published','archived')),
  starts_at TIMESTAMPTZ,
  location_label VARCHAR(220),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT published_must_have_timestamp CHECK (publish_status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_activities_public ON activities(published_at DESC, id DESC) WHERE publish_status = 'published';
CREATE TABLE IF NOT EXISTS activity_results (
  activity_id UUID PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
  result_status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (result_status IN ('draft','verified')),
  sessions_count INTEGER NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
  attendance_count INTEGER NOT NULL DEFAULT 0 CHECK (attendance_count >= 0),
  summary TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  CONSTRAINT verified_result_needs_timestamp CHECK (result_status <> 'verified' OR verified_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_code VARCHAR(30) NOT NULL CHECK (category_code IN ('brand','infographic','video','photo','handbook','ambassador')),
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('drive','upload')),
  public_source_url TEXT,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected','revoked')),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  rights_checked_at TIMESTAMPTZ,
  privacy_checked_at TIMESTAMPTZ,
  safety_checked_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_media_must_be_approved CHECK (
    NOT is_public OR (approval_status = 'approved' AND approved_at IS NOT NULL
      AND rights_checked_at IS NOT NULL AND privacy_checked_at IS NOT NULL AND safety_checked_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_media_public ON media_assets(approved_at DESC, id DESC) WHERE approval_status = 'approved' AND is_public = TRUE;
COMMIT;
