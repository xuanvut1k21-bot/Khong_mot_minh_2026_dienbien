import "server-only";
import type { PoolClient } from "pg";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";
import { EditorialError } from "@/lib/server/activity-editorial";

export async function mediaPermission(
  db: PoolClient, actorId: string, action: string,
  organizationId: string, mediaId: string | null = null
): Promise<boolean> {
  const result = await db.query(
    [
      "SELECT EXISTS(SELECT 1 FROM admin_role_assignments a",
      "JOIN admin_role_permissions p ON p.role_code=a.role_code",
      "JOIN admin_users u ON u.id=a.user_id",
      "WHERE a.user_id=$1 AND u.enabled=TRUE",
      "AND p.resource='media' AND p.action=$2",
      "AND (a.scope_type='global'",
      "OR (a.scope_type='unit' AND a.scope_id=$3::uuid)",
      "OR (a.scope_type='record' AND a.scope_id=$4::uuid))) AS allowed"
    ].join(" "),
    [actorId,action,organizationId,mediaId]
  );
  return result.rows[0]?.allowed === true;
}

export function validDriveFileUrl(value: string | null): string {
  const url = safeOfficialDriveUrl(value);
  if (!url) throw new EditorialError(400,"INVALID_DRIVE_FILE_URL");
  return url;
}

export async function requireApprovedDriveAsset(
  db: PoolClient, id: string
): Promise<{
  id: string; title: string; public_source_url: string; owner_organization_id: string;
}> {
  const result = await db.query(
    [
      "SELECT m.id,m.title,m.public_source_url,m.owner_organization_id",
      "FROM media_assets m JOIN organizations o ON o.id=m.owner_organization_id",
      "WHERE m.id=$1 AND o.active=TRUE",
      "AND m.source_type='drive' AND m.approval_status='approved'",
      "AND m.is_public=TRUE AND m.approved_at IS NOT NULL",
      "AND m.rights_checked_at IS NOT NULL AND m.privacy_checked_at IS NOT NULL",
      "AND m.safety_checked_at IS NOT NULL FOR SHARE OF m"
    ].join(" "), [id]
  );
  if (!result.rowCount) throw new EditorialError(409,"MEDIA_NOT_PUBLIC");
  validDriveFileUrl(result.rows[0].public_source_url);
  return result.rows[0];
}

export async function mediaAudit(
  db: PoolClient,
  actorId: string, assetId: string, action: "create"|"approve"|"reject"|"revoke",
  fromStatus: string|null, toStatus: string, note: string|null = null
): Promise<void> {
  await db.query(
    [
      "INSERT INTO media_review_events",
      "(asset_id,actor_id,action,from_status,to_status,note)",
      "VALUES($1,$2,$3,$4,$5,$6)"
    ].join(" "), [assetId,actorId,action,fromStatus,toStatus,note]
  );
  await db.query(
    "INSERT INTO admin_audit_logs(actor_id,event_type,resource,resource_id) VALUES($1,$2,'media',$3)",
    [actorId,"media_"+action,assetId]
  );
}
