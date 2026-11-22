import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import { checkedPreviewKey, imageResponse, loadProcessedImage } from "@/lib/server/media-content";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

export async function GET(_request:Request,context:Context) {
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({error:"NOT_FOUND"},{status:404});
  try{
    const result=await getDatabasePool().query(
      [
        "SELECT m.preview_object_key,m.checksum_sha256",
        "FROM media_assets m JOIN organizations o ON o.id=m.owner_organization_id",
        "WHERE m.id=$1 AND o.active=TRUE AND m.source_type='upload'",
        "AND m.approval_status='approved' AND m.is_public=TRUE",
        "AND m.scan_status='clean' AND m.preview_ready=TRUE",
        "AND m.approved_at IS NOT NULL AND m.approved_at<=NOW()",
        "AND m.rights_checked_at IS NOT NULL AND m.privacy_checked_at IS NOT NULL",
        "AND m.safety_checked_at IS NOT NULL LIMIT 1"
      ].join(" "),[id]
    );
    if(result.rowCount!==1)return new Response("Not found",{status:404});
    const row=result.rows[0];
    const key=checkedPreviewKey(id,row.checksum_sha256,row.preview_object_key);
    if(!key)return new Response("Not found",{status:404});
    return imageResponse(await loadProcessedImage(key));
  }catch{
    return new Response("Preview unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
