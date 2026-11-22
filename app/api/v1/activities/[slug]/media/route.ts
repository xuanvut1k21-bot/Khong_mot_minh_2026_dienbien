import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import { isDatabaseConfigured } from "@/lib/server/db";
import { publicMediaUrl } from "@/lib/server/public-content";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{slug:string}>};

export async function GET(_request:NextRequest,context:Context) {
  const {slug}=await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length>160)
    return NextResponse.json({error:"INVALID_SLUG"},{status:400});
  if (!isDatabaseConfigured()) return NextResponse.json(
    {items:[],dataStatus:"not_configured"},
    {headers:{"Cache-Control":"no-store"}}
  );
  try {
    const data=await getDatabasePool().query(
      [
        "SELECT m.id,m.title,m.description,m.category_code,m.public_source_url,",
        "m.source_type,m.scan_status,m.preview_ready,m.preview_object_key,m.checksum_sha256",
        "FROM activities a",
        "JOIN organizations ao ON ao.id=a.organization_id AND ao.active=TRUE",
        "JOIN activity_assets l ON l.activity_id=a.id AND l.link_status='approved'",
        "JOIN media_assets m ON m.id=l.media_asset_id",
        "JOIN organizations mo ON mo.id=m.owner_organization_id AND mo.active=TRUE",
        "WHERE a.slug=$1 AND a.publish_status='published'",
        "AND a.published_at IS NOT NULL AND a.published_at<=NOW()",
        "AND (m.source_type='drive' OR (m.source_type='upload'",
        "AND m.scan_status='clean' AND m.preview_ready=TRUE))",
        "AND m.approval_status='approved' AND m.is_public=TRUE",
        "AND m.approved_at IS NOT NULL AND m.approved_at<=NOW()",
        "AND m.rights_checked_at IS NOT NULL AND m.privacy_checked_at IS NOT NULL",
        "AND m.safety_checked_at IS NOT NULL",
        "ORDER BY l.reviewed_at DESC,m.id DESC LIMIT 50"
      ].join(" "),[slug]
    );
    return NextResponse.json({
      items:data.rows.flatMap(row=>{
        const url=publicMediaUrl(row);
        return url?[{
          id:row.id,title:row.title,description:row.description,
          category:row.category_code,url
        }]:[];
      }),
      dataStatus:"available"
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"CONTENT_UNAVAILABLE"},{status:503,
      headers:{"Cache-Control":"no-store"}});
  }
}
