import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  permitted, recordActivityEvent, errorResponse, EditorialError,
  activityBodySchema
} from "@/lib/server/activity-editorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["all","draft","pending","approved","published","archived"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1)
});
const createSchema = activityBodySchema.extend({ organizationId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const actor = await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"}, {status:401});
  const parsed = querySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? "all",
    page: request.nextUrl.searchParams.get("page") ?? "1"
  });
  if (!parsed.success) return NextResponse.json({error:"INVALID_FILTER"}, {status:400});
  const {status,page} = parsed.data;
  try {
    const result = await getDatabasePool().query(
      [
        "WITH grants AS (SELECT p.action,a.scope_type,a.scope_id FROM admin_role_assignments a",
        "JOIN admin_role_permissions p ON p.role_code=a.role_code",
        "WHERE a.user_id=$1 AND p.resource='activities'),",
        "accessible AS (SELECT a.*,o.public_name AS organization_name,",
        "r.result_status,r.sessions_count,r.attendance_count,r.summary AS result_summary,",
        "r.entered_by,r.verified_at,",
        "EXISTS (SELECT 1 FROM grants g WHERE g.action='view' AND",
        "(g.scope_type='global' OR (g.scope_type='unit' AND g.scope_id=a.organization_id)",
        "OR (g.scope_type='record' AND g.scope_id=a.id))) AS can_view,",
        "EXISTS (SELECT 1 FROM grants g WHERE g.action='edit' AND",
        "(g.scope_type='global' OR (g.scope_type='unit' AND g.scope_id=a.organization_id)",
        "OR (g.scope_type='record' AND g.scope_id=a.id))) AS can_edit,",
        "EXISTS (SELECT 1 FROM grants g WHERE g.action='approve' AND",
        "(g.scope_type='global' OR (g.scope_type='unit' AND g.scope_id=a.organization_id)",
        "OR (g.scope_type='record' AND g.scope_id=a.id))) AS can_approve,",
        "EXISTS (SELECT 1 FROM grants g WHERE g.action='publish' AND",
        "(g.scope_type='global' OR (g.scope_type='unit' AND g.scope_id=a.organization_id)",
        "OR (g.scope_type='record' AND g.scope_id=a.id))) AS can_publish,",
        "EXISTS (SELECT 1 FROM grants g WHERE g.action='verify_results' AND",
        "(g.scope_type='global' OR (g.scope_type='unit' AND g.scope_id=a.organization_id)",
        "OR (g.scope_type='record' AND g.scope_id=a.id))) AS can_verify",
        "FROM activities a JOIN organizations o ON o.id=a.organization_id",
        "LEFT JOIN activity_results r ON r.activity_id=a.id",
        "WHERE o.active=TRUE)",
        "SELECT id,title,slug,summary,category_code,organization_id,organization_name,",
        "publish_status,event_status,starts_at,location_label,",
        "created_by,submitted_by,approved_by,published_at,",
        "result_status,sessions_count,attendance_count,result_summary,entered_by,verified_at,",
        "can_edit,can_approve,can_publish,can_verify",
        "FROM accessible WHERE can_view=TRUE",
        "AND ($2::text='all' OR publish_status=$2)",
        "ORDER BY updated_at DESC,id DESC LIMIT 20 OFFSET $3"
      ].join(" "),
      [actor.id,status,(page-1)*20]
    );
    return NextResponse.json(
      {items:result.rows,page,limit:20},
      {headers:{"Cache-Control":"no-store"}}
    );
  } catch(error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!validateAdminWriteOrigin(request)) return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor = await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const input = await parseJsonBody(request, createSchema);
  if (!input) return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const unit = await db.query(
      "SELECT id FROM organizations WHERE id=$1 AND active=TRUE FOR SHARE",
      [input.organizationId]
    );
    if (!unit.rowCount) throw new EditorialError(404,"UNIT_NOT_FOUND");
    if (!await permitted(db,actor.id,"edit",input.organizationId))
      throw new EditorialError(403,"FORBIDDEN");

    const result = await db.query(
      [
        "INSERT INTO activities(organization_id,slug,title,summary,category_code,starts_at,location_label,",
        "publish_status,created_by)",
        "VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8) RETURNING id,slug,publish_status"
      ].join(" "),
      [input.organizationId,input.slug,input.title,input.summary,input.category,input.startsAt,input.location,actor.id]
    );
    const activity=result.rows[0];
    await recordActivityEvent(db,actor.id,activity.id,"create",null,"draft");
    await db.query("COMMIT");
    return NextResponse.json({activity},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
