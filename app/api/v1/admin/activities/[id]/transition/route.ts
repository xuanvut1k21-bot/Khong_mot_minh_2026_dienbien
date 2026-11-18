import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  activityIdSchema, authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  permitted, recordActivityEvent, errorResponse, EditorialError
} from "@/lib/server/activity-editorial";

export const runtime = "nodejs";
type Context={params:Promise<{id:string}>};
const schema=z.object({
  action:z.enum(["submit","return","approve","publish","complete"])
}).strict();

export async function POST(request:NextRequest,context:Context) {
  if (!validateAdminWriteOrigin(request)) return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if (!activityIdSchema.safeParse(id).success) return NextResponse.json({error:"INVALID_ID"},{status:400});
  const input=await parseJsonBody(request,schema);
  if (!input) return NextResponse.json({error:"INVALID_INPUT"},{status:400});

  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const found=await db.query(
      [
        "SELECT id,organization_id,publish_status,event_status,starts_at,",
        "created_by,submitted_by,approved_by FROM activities",
        "WHERE id=$1 FOR UPDATE"
      ].join(" "),[id]
    );
    if (!found.rowCount) throw new EditorialError(404,"NOT_FOUND");
    const a=found.rows[0];
    const right:Record<typeof input.action,string>={
      submit:"submit",return:"approve",approve:"approve",publish:"publish",complete:"edit"
    };
    if (!await permitted(db,actor.id,right[input.action],a.organization_id,id))
      throw new EditorialError(403,"FORBIDDEN");

    const oldStatus:string=a.publish_status;
    let newStatus=oldStatus;
    if (input.action==="submit") {
      if (oldStatus!=="draft") throw new EditorialError(409,"INVALID_TRANSITION");
      await db.query(
        "UPDATE activities SET publish_status='pending',submitted_by=$2,approved_by=NULL,updated_at=NOW() WHERE id=$1",
        [id,actor.id]
      );
      newStatus="pending";
    } else if (input.action==="return") {
      if (!["pending","approved"].includes(oldStatus))
        throw new EditorialError(409,"INVALID_TRANSITION");
      if (actor.id===a.created_by || actor.id===a.submitted_by)
        throw new EditorialError(403,"SEPARATION_REQUIRED");
      await db.query(
        [
          "UPDATE activities SET publish_status='draft',submitted_by=NULL,",
          "approved_by=NULL,updated_at=NOW() WHERE id=$1"
        ].join(" "),[id]
      );
      newStatus="draft";
    } else if (input.action==="approve") {
      if (oldStatus!=="pending" || !a.submitted_by)
        throw new EditorialError(409,"INVALID_TRANSITION");
      if (actor.id===a.created_by || actor.id===a.submitted_by)
        throw new EditorialError(403,"SEPARATION_REQUIRED");
      await db.query(
        "UPDATE activities SET publish_status='approved',approved_by=$2,updated_at=NOW() WHERE id=$1",
        [id,actor.id]
      );
      newStatus="approved";
    } else if (input.action==="publish") {
      if (oldStatus!=="approved" || !a.approved_by)
        throw new EditorialError(409,"INVALID_TRANSITION");
      if (actor.id===a.created_by || actor.id===a.submitted_by)
        throw new EditorialError(403,"SEPARATION_REQUIRED");
      await db.query(
        [
          "UPDATE activities SET publish_status='published',published_by=$2,",
          "published_at=NOW(),updated_at=NOW() WHERE id=$1"
        ].join(" "),[id,actor.id]
      );
      newStatus="published";
    } else {
      if (
        oldStatus!=="published" || a.event_status!=="planned" ||
        !a.starts_at || new Date(a.starts_at).getTime()>Date.now()
      ) throw new EditorialError(409,"ACTIVITY_NOT_READY_TO_COMPLETE");
      await db.query(
        "UPDATE activities SET event_status='completed',updated_at=NOW() WHERE id=$1",
        [id]
      );
    }
    await recordActivityEvent(db,actor.id,id,input.action,oldStatus,newStatus);
    await db.query("COMMIT");
    return NextResponse.json({success:true,status:newStatus});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
