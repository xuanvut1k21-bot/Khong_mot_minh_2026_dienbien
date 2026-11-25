import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import {
 authenticateAdmin,validateAdminWriteOrigin,parseJsonBody,
 EditorialError,errorResponse
} from "@/lib/server/activity-editorial";
import { getDatabasePool } from "@/lib/server/db";
import {
 questionContent,mustTrainingPermission,recordTrainingEvent
} from "@/lib/server/training-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";

export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("save"),content:questionContent}).strict(),
 z.object({action:z.enum(["submit","return","approve","archive"])}).strict()
]);
const uuid=z.string().uuid();

export async function POST(request:NextRequest,ctx:Context){
 if(!validateAdminWriteOrigin(request))
  return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const actor=await authenticateAdmin(request);
 if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
 const {id}=await ctx.params;
 if(!uuid.safeParse(id).success)
  return NextResponse.json({error:"INVALID_ID"},{status:400});
 const body=await parseJsonBody(request,schema);
 if(!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 const db=await getDatabasePool().connect();
 try{
  await db.query("BEGIN");
  const selected=await db.query([
   "SELECT id,created_by,approval_status,source_reference",
   "FROM training_questions WHERE id=$1 FOR UPDATE"
  ].join(" "),[id]);
  if(selected.rowCount!==1)throw new EditorialError(404,"QUESTION_NOT_FOUND");
  const question=selected.rows[0],before=String(question.approval_status);
  const review=["return","approve","archive"].includes(body.action);
  await mustTrainingPermission(db,actor.id,"training_questions",review?"approve":"edit");
  let after:string;
  if(body.action==="save"){
   if(before!=="draft"||question.created_by!==actor.id)
    throw new EditorialError(409,"DRAFT_OWNERSHIP_REQUIRED");
   const url=safeOfficialDriveUrl(body.content.sourceUrl);
   if(!url)throw new EditorialError(400,"INVALID_SOURCE_DRIVE_URL");
   await db.query([
    "UPDATE training_questions SET question_text=$2,option_a=$3,option_b=$4,",
    "option_c=$5,option_d=$6,correct_index=$7,source_reference=$8,",
    "updated_at=NOW() WHERE id=$1"
   ].join(" "),[id,body.content.text,...body.content.options,body.content.correctIndex,url]);
   after="draft";
  }else if(body.action==="submit"){
   if(before!=="draft"||question.created_by!==actor.id||
       !safeOfficialDriveUrl(question.source_reference))
    throw new EditorialError(409,"DRAFT_OWNERSHIP_OR_SOURCE_INVALID");
   await db.query(
    "UPDATE training_questions SET approval_status='pending',updated_at=NOW() WHERE id=$1",
    [id]
   );after="pending";
  }else if(body.action==="return"){
   if(before!=="pending")
    throw new EditorialError(409,"NOT_PENDING");
   await db.query([
    "UPDATE training_questions SET approval_status='draft',approved_by=NULL,",
    "approved_at=NULL,updated_at=NOW() WHERE id=$1"
   ].join(" "),[id]);after="draft";
  }else if(body.action==="approve"){
   if(before!=="pending"||question.created_by===actor.id||
      !question.created_by||!safeOfficialDriveUrl(question.source_reference))
    throw new EditorialError(409,"SEPARATION_OR_STATUS_INVALID");
   // Serializes approvals to prevent simultaneous reviewers exceeding 90.
   await db.query("SELECT pg_advisory_xact_lock(804090)");
   const count=await db.query([
    "SELECT COUNT(*)::integer AS count FROM training_questions",
    "WHERE approval_status='approved'"
   ].join(" "));
   if(count.rows[0].count>=90)
    throw new EditorialError(409,"BANK_ALREADY_FULL");
   await db.query([
    "UPDATE training_questions SET approval_status='approved',approved_by=$2,",
    "approved_at=NOW(),updated_at=NOW() WHERE id=$1"
   ].join(" "),[id,actor.id]);after="approved";
  }else{
   if(before!=="approved")throw new EditorialError(409,"NOT_APPROVED");
   await db.query("SELECT pg_advisory_xact_lock(804090)");
   await db.query(
    "UPDATE training_questions SET approval_status='archived',updated_at=NOW() WHERE id=$1",
    [id]
   );after="archived";
  }
  await recordTrainingEvent(db,actor.id,"question",id,body.action,before,after);
  await db.query("COMMIT");
  return NextResponse.json({success:true,status:after},{
   headers:{"Cache-Control":"private, no-store"}
  });
 }catch(e){await db.query("ROLLBACK");return errorResponse(e);}
 finally{db.release();}
}
