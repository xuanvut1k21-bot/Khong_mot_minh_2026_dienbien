# Public content data integration

This step adds a read-only backend for activities and approved Drive media.

## PostgreSQL 16+

- Create an isolated PostgreSQL database; keep secrets in environment variables.
- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_public_content.sql
- Set DATABASE_URL in .env.local (never commit it), then run npm install and npm run dev.
- GET /api/v1/activities and GET /api/v1/media accept page and category filters.
- If DB is not configured, the APIs return an empty list with dataStatus not_configured.
- If configured DB is unavailable, APIs return HTTP 503, not an unreviewed dataset.
- No actual events or media are seeded.

## Rules

Published activities only. Results appear only when verified.
Media must be approved, public, safety-checked, rights-checked and privacy-checked.
Only valid HTTPS Google Drive file view URLs are returned by this version.
No public uploads, no user-submitted events, no admin authentication or edit routes yet.
Do not enter data about students or sensitive assistance cases in this prototype.

This baseline schema is the version committed to the repository. SQL snippets
005-011 written earlier in conversation are NOT compatible drop-in migrations.
Future backend development must use incremental migrations against this baseline.

CI includes PostgreSQL 16 migration and basic visibility/constraint checks.
