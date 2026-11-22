import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  errorResponse, EditorialError
} from "@/lib/server/activity-editorial";
import { mediaPermission, mediaAudit } from "@/lib/server/media-editorial";
import {
  getMediaS3, getMediaStorageConfig, MAX_VIDEO_UPLOAD_BYTES, isAllowedUpload
} from "@/lib/server/media-storage";

export const runtime="nodejs";
const schema=z.object({
  title:z.string().trim().min(3).max(300),
  description:z.string().trim().max(10000).default(""),
  category:z.enum(["photo","infographic","brand","ambassador","handbook","video"]),
  organizationId:z.string().uuid(),
  mime:z.enum(["image/jpeg","image/png","image/webp","application/pdf","video/mp4"]),
  size:z.number().int().min(1).max(MAX_VIDEO_UPLOAD_BYTES)
}).strict();

export async function POST(request:NextRequest) {
  if (!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const body=await parseJsonBody(request,schema);
  if (!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  if (!isAllowedUpload(body.mime,body.category,body.size))
    return NextResponse.json({error:"UNSUPPORTED_FILE_TYPE_OR_SIZE"},{status:400});

  let storage, s3;
  try { storage=getMediaStorageConfig(); s3=getMediaS3(); }
  catch {return NextResponse.json({error:"IMAGE_UPLOADS_NOT_CONFIGURED"},{status:503});}

  const assetId=randomUUID();
  const sessionId=randomUUID();
  const key="quarantine/"+assetId+"/"+randomUUID();
  const expires=90;
  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const unit=await db.query(
      "SELECT id FROM organizations WHERE id=$1 AND active=TRUE FOR SHARE",
      [body.organizationId]
    );
    if(!unit.rowCount)throw new EditorialError(404,"UNIT_NOT_FOUND");
    if(!await mediaPermission(db,actor.id,"create",body.organizationId))
      throw new EditorialError(403,"FORBIDDEN");

    await db.query(
      [
        "INSERT INTO media_assets(id,title,description,category_code,source_type,",
        "owner_organization_id,created_by,approval_status,is_public,scan_status)",
        "VALUES($1,$2,$3,$4,'upload',$5,$6,'pending',FALSE,'pending')"
      ].join(" "),[
        assetId,body.title,body.description,body.category,body.organizationId,actor.id
      ]
    );
    await db.query(
      [
        "INSERT INTO media_upload_sessions(id,asset_id,uploader_id,object_key,",
        "expected_size_bytes,expected_mime_type,expires_at)",
        "VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '90 seconds')"
      ].join(" "),[sessionId,assetId,actor.id,key,body.size,body.mime]
    );

    // S3 policy is bound to an opaque key, declared MIME and exact file size.
    const signed=await createPresignedPost(s3,{
      Bucket:storage.quarantineBucket,
      Key:key,
      Expires:expires,
      Conditions:[
        ["content-length-range",body.size,body.size],
        ["eq","$Content-Type",body.mime]
      ],
      Fields:{"Content-Type":body.mime}
    });
    await mediaAudit(db,actor.id,assetId,"create",null,"pending",
      "Tải tệp vào vùng cách ly; chưa kiểm tra và chưa công bố");
    await db.query("COMMIT");
    return NextResponse.json({
      assetId,sessionId,uploadUrl:signed.url,fields:signed.fields,
      expiresInSeconds:expires
    },{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error){
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
