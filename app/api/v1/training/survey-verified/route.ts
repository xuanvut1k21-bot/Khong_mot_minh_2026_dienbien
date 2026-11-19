import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import { trainingRegistrationEnabled, verifySurveySignature } from "@/lib/server/training-security";

export const runtime="nodejs";
const schema=z.object({
  eventId:z.string().min(8).max(180).regex(/^[a-zA-Z0-9_-]+$/),
  learnerId:z.string().uuid(),
  lessonNumber:z.union([z.literal(1),z.literal(9)]),
  responseReference:z.string().min(8).max(180).regex(/^[a-zA-Z0-9_-]+$/)
}).strict();

export async function POST(request:NextRequest){
  if(!trainingRegistrationEnabled()||
     process.env.TRAINING_SURVEY_WEBHOOK_ENABLED!=="true")
    return NextResponse.json({error:"SURVEY_VERIFICATION_DISABLED"},{status:503});
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
    return NextResponse.json({error:"INVALID_CONTENT_TYPE"},{status:415});
  const declared=Number(request.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>4096)
    return NextResponse.json({error:"PAYLOAD_TOO_LARGE"},{status:413});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>4096)
    return NextResponse.json({error:"PAYLOAD_TOO_LARGE"},{status:413});
  if(!verifySurveySignature(
    request.headers.get("x-km-timestamp")??"",
    raw,request.headers.get("x-km-signature")??""
  ))return NextResponse.json({error:"INVALID_SIGNATURE"},{status:401});
  let body:z.infer<typeof schema>;
  try{body=schema.parse(JSON.parse(raw));}
  catch{return NextResponse.json({error:"INVALID_PAYLOAD"},{status:400});}

  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const ok=await db.query(
      [
        "SELECT 1 FROM training_learners l",
        "JOIN training_lessons t ON t.lesson_number=$2 AND t.status='published'",
        "WHERE l.id=$1 AND l.deleted_at IS NULL FOR SHARE OF l"
      ].join(" "),[body.learnerId,body.lessonNumber]
    );
    if(ok.rowCount!==1){
      await db.query("ROLLBACK");
      return NextResponse.json({error:"UNKNOWN_LEARNER_OR_LESSON"},{status:404});
    }
    const inserted=await db.query(
      [
        "INSERT INTO training_verified_surveys",
        "(learner_id,lesson_number,provider_event_id,response_reference)",
        "VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id"
      ].join(" "),[
        body.learnerId,body.lessonNumber,body.eventId,body.responseReference
      ]
    );
    // Replayed events are not counted again; mismatched duplicates are not accepted.
    if(inserted.rowCount===0){
      const previous=await db.query(
        [
          "SELECT learner_id,lesson_number,response_reference",
          "FROM training_verified_surveys WHERE provider_event_id=$1"
        ].join(" "),[body.eventId]
      );
      if(previous.rowCount!==1||
         previous.rows[0].learner_id!==body.learnerId||
         Number(previous.rows[0].lesson_number)!==body.lessonNumber||
         previous.rows[0].response_reference!==body.responseReference){
        await db.query("ROLLBACK");
        return NextResponse.json({error:"SURVEY_REFERENCE_CONFLICT"},{status:409});
      }
    }
    await db.query("COMMIT");
    return NextResponse.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
  }catch{
    await db.query("ROLLBACK");
    return NextResponse.json({error:"SURVEY_VERIFICATION_UNAVAILABLE"},{status:503});
  }finally{db.release();}
}
