import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EditorialError } from "@/lib/server/activity-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";

export async function trainingPermitted(
 db:PoolClient,userId:string,resource:"training_lessons"|"training_questions",
 action:"view"|"edit"|"approve"
):Promise<boolean>{
  // Training is a campaign-wide course: only explicit global grants apply.
  // No implicit technical_admin privileges or unrelated unit/record grants.
  const result=await db.query([
    "SELECT EXISTS(SELECT 1 FROM admin_role_assignments a",
    "JOIN admin_role_permissions p ON p.role_code=a.role_code",
    "JOIN admin_users u ON u.id=a.user_id",
    "WHERE a.user_id=$1 AND u.enabled=TRUE",
    "AND a.scope_type='global' AND a.scope_id IS NULL",
    "AND p.resource=$2 AND p.action=$3) AS allowed"
  ].join(" "),[userId,resource,action]);
  return result.rows[0]?.allowed===true;
}
export async function mustTrainingPermission(
  db:PoolClient,userId:string,
  resource:"training_lessons"|"training_questions",
  action:"view"|"edit"|"approve"
){
  if(!await trainingPermitted(db,userId,resource,action))
    throw new EditorialError(403,"FORBIDDEN");
}
export const sourceDrive=z.string().trim().max(500).refine(
  value=>safeOfficialDriveUrl(value)!==null,{message:"INVALID_SOURCE_DRIVE_URL"}
);
export const lessonContent=z.object({
  title:z.string().trim().min(3).max(250),
  materialUrl:sourceDrive
}).strict();
export const questionContent=z.object({
  text:z.string().trim().min(10).max(2000),
  options:z.tuple([
    z.string().trim().min(1).max(700),
    z.string().trim().min(1).max(700),
    z.string().trim().min(1).max(700),
    z.string().trim().min(1).max(700)
  ]),
  correctIndex:z.number().int().min(1).max(4),
  sourceUrl:sourceDrive
}).strict();
export async function recordTrainingEvent(
 db:PoolClient,actorId:string,
 resource:"lesson"|"question",id:string,
 action:string,from:string|null,to:string,note:string|null=null
){
  const sql=[
    "INSERT INTO training_review_events",
    "(actor_id,lesson_number,question_id,action,from_status,to_status,note)",
    "VALUES($1,$2,$3,$4,$5,$6,$7)"
  ].join(" ");
  await db.query(sql,[
    actorId,resource==="lesson"?Number(id):null,
    resource==="question"?id:null,action,from,to,note
  ]);
  await db.query(
    "INSERT INTO admin_audit_logs(actor_id,event_type,resource,resource_id) VALUES($1,$2,$3,$4)",
    [actorId,"training_"+resource+"_"+action,"training_"+resource,
      resource==="question"?id:null]
  );
}
