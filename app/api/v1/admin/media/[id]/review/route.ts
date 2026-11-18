import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  activityIdSchema, authenticateAdmin, validateAdminWriteOrigin,
  parseJsonBody, errorResponse, EditorialError
} from "@/lib/server/activity-editorial";
import { mediaAudit, mediaPermission, validDriveFileUrl } from "@/lib/server/media-editorial";
import { checkedPreviewKey } from "@/lib/server/media-content";

export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const reviewSchema=z.discriminatedUnion("action",[
  z.object({
    action:z.literal("approve"),
    rightsHolder:z.string().trim().min(2).max(300),
    rightsBasis:z.string().trim().min(10).max(1500),
    rightsEvidenceRef:z.string().trim().min(3).max(500),
    rightsConfirmed:z.literal(true),
    privacyConfirmed:z.literal(true),
    safetyConfirmed:z.literal(true)
  }).strict(),
  z.object({action:z.literal("reject"),reason:z.string().trim().min(8).max(1000)}).strict(),
  z.object({action:z.literal("revoke"),reason:z.string().trim().min(8).max(1000)}).strict()
]);

export async function POST(request:NextRequest,context:Context) {
  if (!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if (!activityIdSchema.safeParse(id).success)
    return NextResponse.json({error:"INVALID_ID"},{status:400});
  const input=await parseJsonBody(request,reviewSchema);
  if (!input) return NextResponse.json({error:"INVALID_REVIEW"},{status:400});

  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const found=await db.query(
      [
        "SELECT id,owner_organization_id,created_by,source_type,",
        "public_source_url,approval_status,scan_status,preview_ready,",
        "preview_object_key,checksum_sha256,original_mime_type",
        "FROM media_assets WHERE id=$1 FOR UPDATE"
      ].join(" "),[id]
    );
    if (!found.rowCount) throw new EditorialError(404,"NOT_FOUND");
    const asset=found.rows[0];
    if (!asset.owner_organization_id || !asset.created_by)
      throw new EditorialError(409,"UNASSIGNED_MEDIA");

    const right=input.action==="revoke"?"revoke":"approve";
    if (!await mediaPermission(db,actor.id,right,asset.owner_organization_id,id))
      throw new EditorialError(403,"FORBIDDEN");

    const org=await db.query(
      "SELECT id FROM organizations WHERE id=$1 AND active=TRUE FOR SHARE",
      [asset.owner_organization_id]
    );
    if (!org.rowCount) throw new EditorialError(409,"UNIT_INACTIVE");

    const before:string=asset.approval_status;
    if (input.action==="approve") {
      if (before!=="pending" || asset.created_by===actor.id)
        throw new EditorialError(409,"SEPARATION_OR_STATUS_INVALID");
      if (asset.source_type==="drive"){
        validDriveFileUrl(asset.public_source_url);
      } else if (asset.source_type==="upload"){
        if (
          asset.scan_status!=="clean" || asset.preview_ready!==true ||
          !["image/jpeg","image/png","image/webp"].includes(asset.original_mime_type) ||
          !checkedPreviewKey(id,asset.checksum_sha256,asset.preview_object_key)
        ) throw new EditorialError(409,"IMAGE_NOT_SCANNED");
      } else {
        throw new EditorialError(409,"UNSUPPORTED_MEDIA_SOURCE");
      }
      await db.query(
        [
          "UPDATE media_assets SET",
          "approval_status='approved',is_public=TRUE,approved_by=$2,approved_at=NOW(),",
          "rights_holder=$3,rights_basis=$4,rights_evidence_ref=$5,",
          "rights_checked_at=NOW(),privacy_checked_at=NOW(),safety_checked_at=NOW(),",
          "rejection_reason=NULL WHERE id=$1"
        ].join(" "),[
          id,actor.id,input.rightsHolder,input.rightsBasis,input.rightsEvidenceRef
        ]
      );
      await mediaAudit(db,actor.id,id,"approve",before,"approved",
        "Nguồn đã được kiểm tra: quyền sử dụng, riêng tư và tính phù hợp nội dung");
    } else if (input.action==="reject") {
      if (before!=="pending" || asset.created_by===actor.id)
        throw new EditorialError(409,"SEPARATION_OR_STATUS_INVALID");
      await db.query(
        "UPDATE media_assets SET approval_status='rejected',is_public=FALSE,rejection_reason=$2 WHERE id=$1",
        [id,input.reason]
      );
      await mediaAudit(db,actor.id,id,"reject",before,"rejected",input.reason);
    } else {
      if (before!=="approved")
        throw new EditorialError(409,"INVALID_TRANSITION");
      await db.query(
        "UPDATE media_assets SET approval_status='revoked',is_public=FALSE WHERE id=$1",
        [id]
      );
      await mediaAudit(db,actor.id,id,"revoke",before,"revoked",input.reason);
    }
    await db.query("COMMIT");
    return NextResponse.json({
      success:true,status:input.action==="approve"?"approved":
        input.action==="reject"?"rejected":"revoked"
    },{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
