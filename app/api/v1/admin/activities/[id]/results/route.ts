import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  activityIdSchema, authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  permitted, recordActivityEvent, errorResponse, EditorialError
} from "@/lib/server/activity-editorial";

export const runtime = "nodejs";
type Context={params:Promise<{id:string}>};
const schema=z.discriminatedUnion("action",[
  z.object({
    action:z.literal("save"),
    sessionsCount:z.number().int().min(0).max(100000),
    attendanceCount:z.number().int().min(0).max(10000000),
    summary:z.string().trim().min(10).max(10000)
  }).strict(),
  z.object({action:z.literal("verify")}).strict()
]);

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
        "SELECT id,organization_id,publish_status,event_status",
        "FROM activities WHERE id=$1 FOR UPDATE"
      ].join(" "),[id]
    );
    if (!found.rowCount) throw new EditorialError(404,"NOT_FOUND");
    const activity=found.rows[0];
    const required=input.action==="save"?"edit":"verify_results";
    if (!await permitted(db,actor.id,required,activity.organization_id,id))
      throw new EditorialError(403,"FORBIDDEN");
    if (activity.publish_status!=="published" || activity.event_status!=="completed")
      throw new EditorialError(409,"ACTIVITY_NOT_COMPLETED");

    if (input.action==="save") {
      const saved=await db.query(
        [
          "INSERT INTO activity_results(activity_id,result_status,sessions_count,attendance_count,summary,",
          "entered_by,verified_by,verified_at)",
          "VALUES($1,'draft',$2,$3,$4,$5,NULL,NULL)",
          "ON CONFLICT(activity_id) DO UPDATE SET",
          "sessions_count=EXCLUDED.sessions_count,attendance_count=EXCLUDED.attendance_count,",
          "summary=EXCLUDED.summary,entered_by=EXCLUDED.entered_by,",
          "result_status='draft',verified_by=NULL,verified_at=NULL",
          "WHERE activity_results.result_status='draft' RETURNING activity_id"
        ].join(" "),
        [id,input.sessionsCount,input.attendanceCount,input.summary,actor.id]
      );
      if (!saved.rowCount) throw new EditorialError(409,"RESULT_ALREADY_VERIFIED");
    } else {
      const rows=await db.query(
        "SELECT result_status,entered_by,summary FROM activity_results WHERE activity_id=$1 FOR UPDATE",[id]
      );
      if (!rows.rowCount || rows.rows[0].result_status!=="draft" || !rows.rows[0].entered_by)
        throw new EditorialError(409,"RESULT_NOT_READY");
      if (rows.rows[0].entered_by===actor.id)
        throw new EditorialError(403,"SEPARATION_REQUIRED");
      if (!rows.rows[0].summary || rows.rows[0].summary.trim().length<10)
        throw new EditorialError(409,"RESULT_NOT_READY");
      await db.query(
        [
          "UPDATE activity_results SET result_status='verified',",
          "verified_by=$2,verified_at=NOW() WHERE activity_id=$1"
        ].join(" "),[id,actor.id]
      );
    }
    await recordActivityEvent(
      db,actor.id,id,input.action==="save"?"save_result":"verify_result",
      activity.publish_status,activity.publish_status
    );
    await db.query("COMMIT");
    return NextResponse.json({
      success:true,resultStatus:input.action==="save"?"draft":"verified"
    });
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
