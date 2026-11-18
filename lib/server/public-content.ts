import { getDatabasePool } from "./db";

export const activityCategories = ["workshop", "five_minutes", "training", "ambassador", "community"] as const;
export const mediaCategories = ["brand", "infographic", "video", "photo", "handbook", "ambassador"] as const;
export type ActivityCategory = (typeof activityCategories)[number];
export type MediaCategory = (typeof mediaCategories)[number];

export type ActivityPublic = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  organization: string;
  startsAt: string | null;
  location: string | null;
  publishedAt: string;
  verifiedResult: { sessionsCount: number; attendanceCount: number; summary: string } | null;
  firstMediaUrl: string | null;
};

export type MediaPublic = {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
};

function iso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

// Only a deliberately constrained official Drive file URL can be exposed.
export function safeOfficialDriveUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "drive.google.com" ||
      url.username || url.password || url.port || url.search || url.hash ||
      !/^\/file\/d\/[A-Za-z0-9_-]{15,128}\/view\/?$/.test(url.pathname)
    ) return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch { return null; }
}

export async function getPublishedActivities(
  { category, page = 1, limit = 12 }: { category?: ActivityCategory; page?: number; limit?: number } = {}
): Promise<{ items: ActivityPublic[]; hasMore: boolean }> {
  const sql = [
    "SELECT a.id, a.slug, a.title, a.summary, a.category_code,",
    "o.public_name, a.starts_at, a.location_label, a.published_at,",
    "r.sessions_count, r.attendance_count, r.summary AS result_summary,",
    "ml.public_source_url AS first_media_url",
    "FROM activities a",
    "JOIN organizations o ON o.id = a.organization_id",
    "LEFT JOIN activity_results r ON r.activity_id = a.id",
    "AND r.result_status = 'verified' AND r.verified_at IS NOT NULL AND r.verified_at <= NOW() AND a.event_status='completed'",
    "LEFT JOIN LATERAL (SELECT m.public_source_url",
    "FROM activity_assets l JOIN media_assets m ON m.id=l.media_asset_id",
    "JOIN organizations mo ON mo.id=m.owner_organization_id AND mo.active=TRUE",
    "WHERE l.activity_id=a.id AND l.link_status='approved'",
    "AND m.source_type='drive' AND m.approval_status='approved' AND m.is_public=TRUE",
    "AND m.approved_at IS NOT NULL AND m.approved_at<=NOW()",
    "AND m.rights_checked_at IS NOT NULL AND m.privacy_checked_at IS NOT NULL",
    "AND m.safety_checked_at IS NOT NULL",
    "ORDER BY l.reviewed_at DESC LIMIT 1) ml ON TRUE",
    "WHERE o.active = TRUE AND a.publish_status = 'published'",
    "AND a.published_at IS NOT NULL AND a.published_at <= NOW()",
    "AND ($1::text IS NULL OR a.category_code = $1::text)",
    "ORDER BY a.published_at DESC, a.id DESC LIMIT $2 OFFSET $3"
  ].join(" ");
  const result = await getDatabasePool().query(sql, [category ?? null, limit + 1, (page - 1) * limit]);
  return {
    hasMore: result.rows.length > limit,
    items: result.rows.slice(0, limit).map(row => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category_code,
      organization: row.public_name,
      startsAt: iso(row.starts_at),
      location: row.location_label,
      publishedAt: iso(row.published_at)!,
      firstMediaUrl: safeOfficialDriveUrl(row.first_media_url),
      verifiedResult: row.sessions_count === null ? null : {
        sessionsCount: row.sessions_count,
        attendanceCount: row.attendance_count,
        summary: row.result_summary
      }
    }))
  };
}

export async function getApprovedMedia(
  { category, page = 1, limit = 12 }: { category?: MediaCategory; page?: number; limit?: number } = {}
): Promise<{ items: MediaPublic[]; hasMore: boolean }> {
  const sql = [
    "SELECT m.id, m.title, m.description, m.category_code, m.public_source_url",
    "FROM media_assets m JOIN organizations mo ON mo.id=m.owner_organization_id AND mo.active=TRUE",
    "WHERE approval_status = 'approved'",
    "AND is_public = TRUE AND approved_at IS NOT NULL AND approved_at <= NOW()",
    "AND rights_checked_at IS NOT NULL AND privacy_checked_at IS NOT NULL",
    "AND safety_checked_at IS NOT NULL AND source_type = 'drive'",
    "AND ($1::text IS NULL OR category_code = $1::text)",
    "ORDER BY m.approved_at DESC, m.id DESC LIMIT $2 OFFSET $3"
  ].join(" ");
  const result = await getDatabasePool().query(sql, [category ?? null, limit + 1, (page - 1) * limit]);
  const clean = result.rows.flatMap(row => {
    const url = safeOfficialDriveUrl(row.public_source_url);
    return url ? [{
      id: row.id, title: row.title, description: row.description,
      category: row.category_code, url
    }] : [];
  });
  return { items: clean.slice(0, limit), hasMore: result.rows.length > limit };
}
