import { NextRequest,NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import {
  getTrainingLearner,trainingOriginValid,randomTrainingToken,tokenDigest
} from "@/lib/server/training-security";
import { getSurveyConfiguration,surveyLesson } from "@/lib/server/training-surveys";

export const runtime="nodejs";
type Context={params:Promise<{number:string}>};
const deny=(error:string,status:number)=>NextResponse.json({error},{status,
  headers:{"Cache-Control":"no-store"}});

export async function POST(request:NextRequest,ctx:Context){
  const number=surveyLesson((await ctx.params).number);
  if(!number)return deny("INVALID_LESSON",400);
  if(!trainingOriginValid(request))return deny("INVALID_ORIGIN",403);
  const provider=getSurveyConfiguration(number);
  if(!provider)return deny("SURVEY_NOT_CONFIGURED",503);
  const learner=await getTrainingLearner(request);
  if(!learner)return deny("UNAUTHORIZED",401);
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    // Lock learner row: rate limit and idempotence across concurrent tabs.
    const owner=await db.query(
      "SELECT id FROM training_learners WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [learner.id]
    );
    if(!owner.rowCount){await db.query("ROLLBACK");return deny("UNAUTHORIZED",401);}
    const lesson=await db.query(
      "SELECT 1 FROM training_lessons WHERE lesson_number=$1 AND status='published'",
      [number]
    );
    if(!lesson.rowCount){await db.query("ROLLBACK");return deny("LESSON_NOT_PUBLISHED",409);}
    const completed=await db.query(
      "SELECT 1 FROM training_verified_surveys WHERE learner_id=$1 AND lesson_number=$2",
      [learner.id,number]
    );
    if(completed.rowCount){await db.query("ROLLBACK");return deny("SURVEY_ALREADY_VERIFIED",409);}
    const limits=await db.query(
      [
        "SELECT COUNT(*) FILTER(WHERE issued_at>NOW()-INTERVAL '24 hours')::integer AS per_day,",
        "MAX(issued_at) AS latest FROM training_survey_handoffs",
        "WHERE learner_id=$1 AND lesson_number=$2"
      ].join(" "),[learner.id,number]
    );
    const current=limits.rows[0];
    if(Number(current.per_day)>=6 ||
      (current.latest && Date.now()-new Date(current.latest).getTime()<60_000)){
      await db.query("ROLLBACK");
      return deny("SURVEY_LAUNCH_RATE_LIMITED",429);
    }
    const token=randomTrainingToken();
    const stored=await db.query(
      [
        "INSERT INTO training_survey_handoffs",
        "(learner_id,lesson_number,token_sha256,expires_at)",
        "VALUES($1,$2,$3,NOW()+INTERVAL '2 hours')",
        "RETURNING expires_at"
      ].join(" "),[learner.id,number,tokenDigest(token)]
    );
    await db.query("COMMIT");
    // A correlation token, not a learner ID, is forwarded to the vetted provider.
    // Provider MUST use it only after confirming a real completed response.
    provider.searchParams.set("km_ref",token);
    return NextResponse.json({
      url:provider.toString(),expiresAt:stored.rows[0].expires_at,
      instructions:"Hoàn thành và nộp khảo sát trên trang đối tác. Mở liên kết không đồng nghĩa đã xác minh."
    },{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch{
    await db.query("ROLLBACK");
    return deny("SURVEY_UNAVAILABLE",503);
  }finally{db.release();}
}
