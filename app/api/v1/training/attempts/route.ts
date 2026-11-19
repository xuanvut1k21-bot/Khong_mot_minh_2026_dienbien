import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import {
  getTrainingLearner,trainingExamEnabled,trainingOriginValid
} from "@/lib/server/training-security";
import {APPROVED_BANK_SIZE,EXAM_QUESTION_COUNT} from "@/lib/training-exam";
import { consumeLearnerBudget,trainingTooManyRequests } from "@/lib/server/training-budgets";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function paper(db:import("pg").PoolClient,id:string){
  const rows=await db.query(
    [
      "SELECT position,question_text,option_a,option_b,option_c,option_d",
      "FROM training_attempt_items WHERE attempt_id=$1 ORDER BY position"
    ].join(" "),[id]
  );
  return rows.rows.map(r=>({
    position:Number(r.position),text:r.question_text,
    options:[r.option_a,r.option_b,r.option_c,r.option_d]
  }));
}
export async function POST(request:NextRequest){
  if(!trainingExamEnabled())
    return NextResponse.json({error:"EXAM_CLOSED"},{status:503});
  if(!trainingOriginValid(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const learner=await getTrainingLearner(request);
  if(!learner)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  try{
    if(!await consumeLearnerBudget(learner.id,"exam_start"))
      return trainingTooManyRequests(60);
  }catch{
    return NextResponse.json({error:"EXAM_UNAVAILABLE"},{status:503,
      headers:{"Cache-Control":"no-store"}});
  }
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    // One start operation per learner at a time.
    const owner=await db.query(
      "SELECT id FROM training_learners WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [learner.id]
    );
    if(owner.rowCount!==1){
      await db.query("ROLLBACK");
      return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
    }
    const pending=await db.query(
      [
        "SELECT id,expires_at,expires_at>NOW() AS active FROM training_attempts",
        "WHERE learner_id=$1 AND status='in_progress' FOR UPDATE"
      ].join(" "),[learner.id]
    );
    if(pending.rowCount===1){
      if(pending.rows[0].active){
        const id=pending.rows[0].id;
        const questions=await paper(db,id);
        await db.query("COMMIT");
        return NextResponse.json({
          attemptId:id,expiresAt:pending.rows[0].expires_at,
          questions
        },{headers:{"Cache-Control":"no-store"}});
      }
      await db.query(
        "UPDATE training_attempts SET status='expired' WHERE id=$1",
        [pending.rows[0].id]
      );
    }

    const check=await db.query(
      [
        "SELECT",
        "(SELECT COUNT(*)::integer FROM training_lessons WHERE status='published') AS lessons,",
        "(SELECT COUNT(*)::integer FROM training_verified_surveys v",
        "JOIN training_survey_handoffs h ON h.id=v.handoff_id",
        "WHERE v.learner_id=$1 AND v.lesson_number IN (1,9)",
        "AND h.consumed_at IS NOT NULL) AS surveys,",
        "(SELECT COUNT(*)::integer FROM training_questions",
        "WHERE approval_status='approved') AS questions"
      ].join(" "),[learner.id]
    );
    const ready=check.rows[0];
    if(ready.lessons!==9||ready.surveys!==2||ready.questions!==APPROVED_BANK_SIZE){
      await db.query("ROLLBACK");
      return NextResponse.json({error:"TRAINING_REQUIREMENTS_NOT_MET"},{status:409});
    }
    const selected=await db.query(
      [
        "SELECT id,question_text,option_a,option_b,option_c,option_d,correct_index",
        "FROM training_questions WHERE approval_status='approved'",
        "ORDER BY random() LIMIT 20"
      ].join(" ")
    );
    if(selected.rows.length!==EXAM_QUESTION_COUNT)
      throw new Error("QUESTION_BANK_CHANGED");

    const result=await db.query(
      "INSERT INTO training_attempts(learner_id) VALUES($1) RETURNING id,expires_at",
      [learner.id]
    );
    const attempt=result.rows[0];
    for(let i=0;i<selected.rows.length;i++){
      const q=selected.rows[i];
      await db.query(
        [
          "INSERT INTO training_attempt_items",
          "(attempt_id,position,question_id,question_text,option_a,option_b,",
          "option_c,option_d,correct_index) VALUES",
          "($1,$2,$3,$4,$5,$6,$7,$8,$9)"
        ].join(" "),[
          attempt.id,i+1,q.id,q.question_text,q.option_a,q.option_b,
          q.option_c,q.option_d,q.correct_index
        ]
      );
    }
    await db.query("COMMIT");
    return NextResponse.json({
      attemptId:attempt.id,expiresAt:attempt.expires_at,
      questions:selected.rows.map((q,i)=>({
        position:i+1,text:q.question_text,
        options:[q.option_a,q.option_b,q.option_c,q.option_d]
      }))
    },{status:201,headers:{"Cache-Control":"no-store"}});
  }catch{
    await db.query("ROLLBACK");
    return NextResponse.json({error:"EXAM_UNAVAILABLE"},{status:503});
  }finally{db.release();}
}
