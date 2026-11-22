import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import { authenticateAdmin } from "@/lib/server/activity-editorial";
import { mediaPermission } from "@/lib/server/media-editorial";
import { checkedPreviewKey, imageResponse, loadProcessedImage } from "@/lib/server/media-content";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

export async function GET(request:NextRequest,context:Context) {
  const actor=await authenticateAdmin(request);
  if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({error:"INVALID_ID"},{status:400});
  try{
    const db=await getDatabasePool().connect();
    let row;
    try {
      const result=await db.query(
        [
          "SELECT m.preview_object_key,m.checksum_sha256,m.owner_organization_id",
          "FROM media_assets m JOIN organizations o ON o.id=m.owner_organization_id",
          "WHERE m.id=$1 AND o.active=TRUE AND m.source_type='upload'",
          "AND m.scan_status='clean' AND m.preview_ready=TRUE LIMIT 1"
        ].join(" "),[id]
      );
      if(!result.rowCount)return new Response("Not found",{status:404});
      row=result.rows[0];
      if(!await mediaPermission(db,actor.id,"view",row.owner_organization_id,id))
        return NextResponse.json({error:"FORBIDDEN"},{status:403});
    }finally{db.release();}
    const key=checkedPreviewKey(id,row.checksum_sha256,row.preview_object_key);
    if(!key)return new Response("Not found",{status:404});
    return imageResponse(await loadProcessedImage(key));
  }catch{
    return new Response("Preview unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
