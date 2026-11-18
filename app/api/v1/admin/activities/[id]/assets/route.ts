import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  authenticateAdmin, activityIdSchema, validateAdminWriteOrigin, parseJsonBody,
  permitted, errorResponse, EditorialError
} from "@/lib/server/activity-editorial";
import { requireApprovedDriveAsset } from "@/lib/server/media-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("propose"),mediaId:z.string().uuid()}).strict(),
  z.object({action:z.literal("approve"),linkId:z.string().uuid()}).strict(),
  z.object({action:z.literal("hide"),linkId:z.string().uuid()}).strict()
]);

async function recordLinkEvent(
  db: import("pg").PoolClient, actorId:string,linkId:string,activityId:string,
  action:"propose"|"approve"|"hide",before:string|null,after:string
) {
  await db.query(
    [
      "INSERT INTO activity_asset_events(link_id,activity_id,actor_id,action,from_status,to_status)",
      "VALUES($1,$2,$3,$4,$5,$6)"
    ].join(" "),[linkId,activityId,actorId,action,before,after]
  );
  await db.query(
    "INSERT INTO admin_audit_logs(actor_id,event_type,resource,resource_id) VALUES($1,$2,'activity_assets',$3)",
    [actorId,"activity_asset_"+action,linkId]
  );
}

export async function GET(request:NextRequest,context:Context) {
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if (!activityIdSchema.safeParse(id).success) return NextResponse.json({error:"INVALID_ID"},{status:400});
  const db=await getDatabasePool().connect();
  try {
    const activity=await db.query(
      "SELECT id,organization_id FROM activities WHERE id=$1",[id]
    );
    if (!activity.rowCount) return NextResponse.json({error:"NOT_FOUND"},{status:404});
    if (!await permitted(db,actor.id,"view",activity.rows[0].organization_id,id))
      return NextResponse.json({error:"FORBIDDEN"},{status:403});
    const canApprove=await permitted(db,actor.id,"approve",activity.rows[0].organization_id,id);
    const results=await db.query(
      [
        "SELECT l.id,l.media_asset_id,l.link_status,l.linked_by,",
        "m.title,m.category_code,m.approval_status,m.is_public,",
        "CASE WHEN m.is_public=TRUE AND m.approval_status='approved'",
        "THEN m.public_source_url ELSE NULL END AS drive_url",
        "FROM activity_assets l JOIN media_assets m ON m.id=l.media_asset_id",
        "WHERE l.activity_id=$1 ORDER BY l.linked_at DESC LIMIT 100"
      ].join(" "),[id]
    );
    return NextResponse.json({
      items:results.rows.map(row=>({
        id:row.id,mediaId:row.media_asset_id,title:row.title,category:row.category_code,
        status:row.link_status,mediaStatus:row.approval_status,
        driveUrl:safeOfficialDriveUrl(row.drive_url),
        canApprove:canApprove && row.linked_by!==actor.id
      }))
    },{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return errorResponse(error);}
  finally {db.release();}
}

export async function POST(request:NextRequest,context:Context) {
  if (!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if (!activityIdSchema.safeParse(id).success)
    return NextResponse.json({error:"INVALID_ID"},{status:400});
  const body=await parseJsonBody(request,bodySchema);
  if (!body) return NextResponse.json({error:"INVALID_INPUT"},{status:400});

  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const found=await db.query(
      "SELECT id,organization_id,created_by,publish_status FROM activities WHERE id=$1 FOR UPDATE",
      [id]
    );
    if (!found.rowCount) throw new EditorialError(404,"ACTIVITY_NOT_FOUND");
    const activity=found.rows[0];
    const permission=body.action==="propose"?"edit":"approve";
    if (!await permitted(db,actor.id,permission,activity.organization_id,id))
      throw new EditorialError(403,"FORBIDDEN");
    if (activity.publish_status==="archived")
      throw new EditorialError(409,"ARCHIVED_ACTIVITY");

    let linkId:string,previous:string|null=null,newStatus:string;
    if (body.action==="propose") {
      await requireApprovedDriveAsset(db,body.mediaId);
      const link=await db.query(
        [
          "INSERT INTO activity_assets(activity_id,media_asset_id,linked_by,link_status)",
          "VALUES($1,$2,$3,'pending')",
          "ON CONFLICT(activity_id,media_asset_id) DO UPDATE",
          "SET link_status='pending',linked_by=EXCLUDED.linked_by,linked_at=NOW(),",
          "reviewed_by=NULL,reviewed_at=NULL",
          "WHERE activity_assets.link_status='hidden'",
          "RETURNING id"
        ].join(" "),[id,body.mediaId,actor.id]
      );
      if (!link.rowCount) throw new EditorialError(409,"LINK_ALREADY_PROPOSED_OR_APPROVED");
      linkId=link.rows[0].id;
      previous=null;newStatus="pending";
    } else {
      const row=await db.query(
        "SELECT id,media_asset_id,linked_by,link_status FROM activity_assets WHERE id=$1 AND activity_id=$2 FOR UPDATE",
        [body.linkId,id]
      );
      if (!row.rowCount) throw new EditorialError(404,"LINK_NOT_FOUND");
      const link=row.rows[0];
      linkId=link.id;
      previous=link.link_status;
      if (body.action==="approve") {
        if (link.link_status!=="pending" || link.linked_by===actor.id || activity.created_by===actor.id)
          throw new EditorialError(409,"SEPARATION_OR_STATUS_INVALID");
        await requireApprovedDriveAsset(db,link.media_asset_id);
        await db.query(
          "UPDATE activity_assets SET link_status='approved',reviewed_by=$2,reviewed_at=NOW() WHERE id=$1",
          [linkId,actor.id]
        );
        newStatus="approved";
      } else {
        if (link.link_status!=="approved")
          throw new EditorialError(409,"LINK_NOT_APPROVED");
        await db.query(
          "UPDATE activity_assets SET link_status='hidden' WHERE id=$1",
          [linkId]
        );
        newStatus="hidden";
      }
    }
    await recordLinkEvent(db,actor.id,linkId,id,body.action,previous,newStatus);
    await db.query("COMMIT");
    return NextResponse.json({success:true,linkId,status:newStatus});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
