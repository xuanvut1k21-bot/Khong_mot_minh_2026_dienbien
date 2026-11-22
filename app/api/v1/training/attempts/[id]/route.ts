import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import { parseJsonBody } from "@/lib/server/activity-editorial";
import {
  getTrainingLearner,trainingExamEnabled,trainingOriginValid,
  TRAINING_SUCCESS_MESSAGE
} from "@/lib/server/training-security";
import { gradeExam } from "@/lib/training-exam";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const schema=z.object({
  answers:z.array(z.object({
    position:z.number().int().min(1).max(20),
    choiceIndex:z.number().int().min(1).max(4)
  }).strict()).max(20)
}).strict();
const uuid=z.string().uuid();

export async function GET(request:NextRequest,ctx:Context){
  if(!trainingExamEnabled())
    return NextResponse.json({error:"EXAM_CLOSED"},{status:503});
  const learner=await getTrainingLearner(request);
  if(!learner)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await ctx.params;
  if(!uuid.safeParse(id).success)
    return NextResponse.json({error:"INVALID_ID"},{status:400});
  try{
    const status=await getDatabasePool().query(
      [
        "SELECT status,expires_at,expires_at>NOW() AS active",
        "FROM training_attempts WHERE id=$1 AND learner_id=$2"
      ].join(" "),[id,learner.id]
    );
    if(status.rowCount!==1)return NextResponse.json({error:"NOT_FOUND"},{status:404});
    const row=status.rows[0];
    if(row.status==="passed"||row.status==="failed"){
      return NextResponse.json({
        status:row.status,passed:row.status==="passed",
        message:row.status==="passed"?TRAINING_SUCCESS_MESSAGE:
          "Chưa đạt yêu cầu. Bạn có thể tham gia lại."
      },{headers:{"Cache-Control":"no-store"}});
    }
    if(row.status==="expired"||!row.active)
      return NextResponse.json({error:"EXPIRED",canRetry:true},{status:410});
    const items=await getDatabasePool().query(
      [
        "SELECT position,question_text,option_a,option_b,option_c,option_d",
        "FROM training_attempt_items WHERE attempt_id=$1 ORDER BY position"
      ].join(" "),[id]
    );
    return NextResponse.json({
      attemptId:id,expiresAt:row.expires_at,
      questions:items.rows.map(r=>({
        position:Number(r.position),text:r.question_text,
        options:[r.option_a,r.option_b,r.option_c,r.option_d]
      }))
    },{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"EXAM_UNAVAILABLE"},{status:503});}
}

export async function POST(request:NextRequest,ctx:Context){
  if(!trainingExamEnabled())
    return NextResponse.json({error:"EXAM_CLOSED"},{status:503});
  if(!trainingOriginValid(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const learner=await getTrainingLearner(request);
  if(!learner)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await ctx.params;
  if(!uuid.safeParse(id).success)
    return NextResponse.json({error:"INVALID_ID"},{status:400});
  const body=await parseJsonBody(request,schema);
  if(!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});

  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const found=await db.query(
      [
        "SELECT id,status,expires_at<=NOW() AS expired FROM training_attempts",
        "WHERE id=$1 AND learner_id=$2 FOR UPDATE"
      ].join(" "),[id,learner.id]
    );
    if(found.rowCount!==1){
      await db.query("ROLLBACK");
      return NextResponse.json({error:"NOT_FOUND"},{status:404});
    }
    if(found.rows[0].status!=="in_progress"){
      await db.query("ROLLBACK");
      return NextResponse.json({error:"ALREADY_FINALIZED"},{status:409});
    }
    if(found.rows[0].expired){
      await db.query("UPDATE training_attempts SET status='expired' WHERE id=$1",[id]);
      await db.query("COMMIT");
      return NextResponse.json({error:"EXPIRED",canRetry:true},{status:410});
    }
    const items=await db.query(
      "SELECT position,correct_index FROM training_attempt_items WHERE attempt_id=$1 ORDER BY position",
      [id]
    );
    let grade;
    try{
      grade=gradeExam(
        items.rows.map(r=>({position:Number(r.position),correctIndex:Number(r.correct_index)})),
        body.answers
      );
    }catch{
      await db.query("ROLLBACK");
      return NextResponse.json({error:"INVALID_ANSWERS"},{status:400});
    }
    for(const answer of body.answers){
      await db.query(
        "UPDATE training_attempt_items SET selected_index=$3 WHERE attempt_id=$1 AND position=$2",
        [id,answer.position,answer.choiceIndex]
      );
    }
    const state=grade.passed?"passed":"failed";
    await db.query(
      [
        "UPDATE training_attempts SET status=$2,correct_count=$3,submitted_at=NOW()",
        "WHERE id=$1"
      ].join(" "),[id,state,grade.correct]
    );
    await db.query("COMMIT");
    return NextResponse.json({
      passed:grade.passed,status:state,
      message:grade.passed?TRAINING_SUCCESS_MESSAGE:
        "Chưa đạt yêu cầu. Bạn có thể ôn tập và làm lại."
    },{headers:{"Cache-Control":"no-store"}});
  }catch{
    await db.query("ROLLBACK");
    return NextResponse.json({error:"EXAM_UNAVAILABLE"},{status:503});
  }finally{db.release();}
}
