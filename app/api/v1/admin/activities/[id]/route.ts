import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import {
  activityBodySchema, activityIdSchema,
  authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  permitted, recordActivityEvent, errorResponse, EditorialError
} from "@/lib/server/activity-editorial";

export const runtime = "nodejs";
type Context = {params: Promise<{id:string}>};

export async function PATCH(request:NextRequest,context:Context) {
  if (!validateAdminWriteOrigin(request)) return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await context.params;
  if (!activityIdSchema.safeParse(id).success) return NextResponse.json({error:"INVALID_ID"},{status:400});
  const input=await parseJsonBody(request,activityBodySchema);
  if (!input) return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const found=await db.query(
      "SELECT id,organization_id,publish_status FROM activities WHERE id=$1 FOR UPDATE",[id]
    );
    if (!found.rowCount) throw new EditorialError(404,"NOT_FOUND");
    const activity=found.rows[0];
    if (!await permitted(db,actor.id,"edit",activity.organization_id,id))
      throw new EditorialError(403,"FORBIDDEN");
    if (activity.publish_status!=="draft")
      throw new EditorialError(409,"EDIT_REQUIRES_DRAFT");
    await db.query(
      [
        "UPDATE activities SET title=$2,slug=$3,summary=$4,category_code=$5,",
        "starts_at=$6,location_label=$7,updated_at=NOW() WHERE id=$1"
      ].join(" "),
      [id,input.title,input.slug,input.summary,input.category,input.startsAt,input.location]
    );
    await recordActivityEvent(db,actor.id,id,"edit","draft","draft");
    await db.query("COMMIT");
    return NextResponse.json({success:true});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
