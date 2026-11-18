import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import {
  authenticateAdmin, validateAdminWriteOrigin, parseJsonBody,
  errorResponse, EditorialError
} from "@/lib/server/activity-editorial";
import { mediaAudit, mediaPermission, validDriveFileUrl } from "@/lib/server/media-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const categories = ["brand","infographic","video","photo","handbook","ambassador"] as const;

const createSchema = z.object({
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(10000).default(""),
  category: z.enum(categories),
  organizationId: z.string().uuid(),
  driveUrl: z.string().url().max(500)
}).strict();

const filterSchema=z.object({
  status:z.enum(["all","pending","approved","rejected","revoked"]).default("all"),
  page:z.coerce.number().int().min(1).max(10000).default(1)
});

export async function GET(request: NextRequest) {
  const actor = await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const query = filterSchema.safeParse({
    status:request.nextUrl.searchParams.get("status")??"all",
    page:request.nextUrl.searchParams.get("page")??"1"
  });
  if (!query.success) return NextResponse.json({error:"INVALID_FILTER"},{status:400});
  try {
    const result=await getDatabasePool().query(
      [
        "WITH perms AS (SELECT p.action,g.scope_type,g.scope_id",
        "FROM admin_role_assignments g JOIN admin_role_permissions p",
        "ON p.role_code=g.role_code WHERE g.user_id=$1 AND p.resource='media'),",
        "accessible AS (SELECT m.*,o.public_name AS organization_name,",
        "EXISTS(SELECT 1 FROM perms p WHERE p.action='view'",
        "AND (p.scope_type='global' OR (p.scope_type='unit' AND p.scope_id=m.owner_organization_id)",
        "OR (p.scope_type='record' AND p.scope_id=m.id))) AS can_view,",
        "EXISTS(SELECT 1 FROM perms p WHERE p.action='approve'",
        "AND (p.scope_type='global' OR (p.scope_type='unit' AND p.scope_id=m.owner_organization_id)",
        "OR (p.scope_type='record' AND p.scope_id=m.id))) AS can_approve,",
        "EXISTS(SELECT 1 FROM perms p WHERE p.action='revoke'",
        "AND (p.scope_type='global' OR (p.scope_type='unit' AND p.scope_id=m.owner_organization_id)",
        "OR (p.scope_type='record' AND p.scope_id=m.id))) AS can_revoke",
        "FROM media_assets m JOIN organizations o ON o.id=m.owner_organization_id)",
        "SELECT id,title,description,category_code,owner_organization_id,organization_name,",
        "public_source_url,approval_status,created_by,rights_holder,rights_basis,",
        "source_type,scan_status,preview_ready,preview_object_key,checksum_sha256,",
        "rights_evidence_ref,rejection_reason,can_approve,can_revoke",
        "FROM accessible WHERE can_view=TRUE",
        "AND ($2::text='all' OR approval_status=$2)",
        "ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3"
      ].join(" "),[actor.id,query.data.status,(query.data.page-1)*20]
    );
    return NextResponse.json({
      items:result.rows.map(row=>({
        id:row.id,title:row.title,description:row.description,
        category:row.category_code,organizationId:row.owner_organization_id,
        organization:row.organization_name,
        driveUrl:row.source_type==="drive"?safeOfficialDriveUrl(row.public_source_url):null,
        sourceType:row.source_type,scanStatus:row.scan_status,
        previewReady:row.preview_ready,
        previewUrl:row.source_type==="upload" && row.scan_status==="clean" &&
          row.preview_ready===true ? "/api/v1/admin/media/"+row.id+"/preview" : null,
        status:row.approval_status,createdBySelf:row.created_by===actor.id,
        rightsHolder:row.rights_holder,rightsBasis:row.rights_basis,
        rightsEvidenceRef:row.rights_evidence_ref,
        rejectionReason:row.rejection_reason,
        canApprove:row.can_approve,canRevoke:row.can_revoke
      })),
      page:query.data.page,limit:20
    },{headers:{"Cache-Control":"no-store"}});
  } catch (error) {return errorResponse(error);}
}

export async function POST(request: NextRequest) {
  if (!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const body=await parseJsonBody(request,createSchema);
  if (!body) return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  let sourceUrl:string;
  try {sourceUrl=validDriveFileUrl(body.driveUrl);}
  catch(error){return errorResponse(error);}
  const db=await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const org=await db.query(
      "SELECT id FROM organizations WHERE id=$1 AND active=TRUE FOR SHARE",
      [body.organizationId]
    );
    if (!org.rowCount) throw new EditorialError(404,"UNIT_NOT_FOUND");
    if (!await mediaPermission(db,actor.id,"create",body.organizationId))
      throw new EditorialError(403,"FORBIDDEN");
    const saved=await db.query(
      [
        "INSERT INTO media_assets(title,description,category_code,source_type,",
        "public_source_url,owner_organization_id,created_by,approval_status,is_public)",
        "VALUES($1,$2,$3,'drive',$4,$5,$6,'pending',FALSE)",
        "RETURNING id,approval_status"
      ].join(" "),[
        body.title,body.description,body.category,sourceUrl,
        body.organizationId,actor.id
      ]
    );
    const asset=saved.rows[0];
    await mediaAudit(db,actor.id,asset.id,"create",null,"pending");
    await db.query("COMMIT");
    return NextResponse.json({asset},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    await db.query("ROLLBACK");
    return errorResponse(error);
  } finally {db.release();}
}
