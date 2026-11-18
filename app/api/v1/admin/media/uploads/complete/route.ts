import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  authenticateAdmin,validateAdminWriteOrigin,parseJsonBody,
  errorResponse,EditorialError
} from "@/lib/server/activity-editorial";
import { getMediaS3,getMediaStorageConfig } from "@/lib/server/media-storage";

export const runtime="nodejs";
const schema=z.object({sessionId:z.string().uuid()}).strict();

export async function POST(request:NextRequest) {
  if (!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const body=await parseJsonBody(request,schema);
  if (!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});

  let storage,s3;
  try {storage=getMediaStorageConfig();s3=getMediaS3();}
  catch{return NextResponse.json({error:"IMAGE_UPLOADS_NOT_CONFIGURED"},{status:503});}

  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const found=await db.query(
      [
        "SELECT id,asset_id,object_key,expected_size_bytes,expected_mime_type,state,expires_at",
        "FROM media_upload_sessions WHERE id=$1 AND uploader_id=$2 FOR UPDATE"
      ].join(" "),[body.sessionId,actor.id]
    );
    if(!found.rowCount)throw new EditorialError(404,"UPLOAD_SESSION_NOT_FOUND");
    const row=found.rows[0];
    if(row.state!=="initiated")throw new EditorialError(409,"UPLOAD_NOT_INITIATED");
    if(new Date(row.expires_at).getTime()<=Date.now())
      throw new EditorialError(409,"UPLOAD_EXPIRED");

    let head;
    try{
      head=await s3.send(new HeadObjectCommand({
        Bucket:storage.quarantineBucket,Key:row.object_key
      }));
    }catch{
      throw new EditorialError(409,"UPLOAD_OBJECT_MISSING");
    }
    if(
      Number(head.ContentLength)!==Number(row.expected_size_bytes) ||
      head.ContentType!==row.expected_mime_type
    )throw new EditorialError(409,"UPLOADED_FILE_MISMATCH");

    await db.query(
      "UPDATE media_upload_sessions SET state='uploaded',completed_at=NOW() WHERE id=$1",
      [row.id]
    );
    await db.query(
      [
        "INSERT INTO admin_audit_logs(actor_id,event_type,resource,resource_id)",
        "VALUES($1,'media_upload_completed','media',$2)"
      ].join(" "),[actor.id,row.asset_id]
    );
    await db.query("COMMIT");
    return NextResponse.json({
      accepted:true,assetId:row.asset_id,
      message:"Tệp đang chờ kiểm tra an toàn; chưa được công bố."
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    await db.query("ROLLBACK");
    return errorResponse(error);
  }finally{db.release();}
}
