import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import { tokenDigest, verifySurveySignature } from "@/lib/server/training-security";
import { getSurveyConfiguration } from "@/lib/server/training-surveys";

export const runtime="nodejs";
const schema=z.object({
  eventId:z.string().min(8).max(180).regex(/^[A-Za-z0-9_-]+$/),
  correlationToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  lessonNumber:z.union([z.literal(1),z.literal(9)]),
  responseReference:z.string().min(8).max(180).regex(/^[A-Za-z0-9_-]+$/),
  submissionVerified:z.literal(true)
}).strict();
const fail=(error:string,status:number)=>NextResponse.json({error},{status,
  headers:{"Cache-Control":"no-store"}});

async function readSignedBody(request:NextRequest):Promise<string|null>{
  const reader=request.body?.getReader();
  if(!reader)return null;
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>4096){await reader.cancel();return null;}
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }catch{return null;}
  finally{reader.releaseLock();}
}

export async function POST(request:NextRequest){
  if(process.env.TRAINING_SURVEY_WEBHOOK_ENABLED!=="true")
    return fail("SURVEY_VERIFICATION_DISABLED",503);
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
    return fail("INVALID_CONTENT_TYPE",415);
  const length=Number(request.headers.get("content-length"));
  if(Number.isFinite(length)&&length>4096)return fail("PAYLOAD_TOO_LARGE",413);
  const raw=await readSignedBody(request);
  if(raw===null)return fail("PAYLOAD_TOO_LARGE",413);
  if(!verifySurveySignature(
    request.headers.get("x-km-timestamp")??"",
    raw,request.headers.get("x-km-signature")??""
  ))return fail("INVALID_SIGNATURE",401);

  let body:z.infer<typeof schema>;
  try{body=schema.parse(JSON.parse(raw));}
  catch{return fail("INVALID_PAYLOAD",400);}
  if(!getSurveyConfiguration(body.lessonNumber))
    return fail("SURVEY_NOT_CONFIGURED",503);

  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const found=await db.query([
      "SELECT h.id,h.learner_id,h.lesson_number,h.consumed_at,",
      "h.expires_at>NOW() AS active,l.deleted_at,t.status AS lesson_status",
      "FROM training_survey_handoffs h",
      "JOIN training_learners l ON l.id=h.learner_id",
      "JOIN training_lessons t ON t.lesson_number=h.lesson_number",
      "WHERE h.token_sha256=$1 FOR UPDATE OF h"
    ].join(" "),[tokenDigest(body.correlationToken)]);
    if(found.rowCount!==1||Number(found.rows[0].lesson_number)!==body.lessonNumber){
      await db.query("ROLLBACK");
      return fail("UNKNOWN_SURVEY_CORRELATION",404);
    }
    const handoff=found.rows[0];
    if(handoff.consumed_at){
      // Only the identical, already-verified provider event is idempotent.
      const previous=await db.query([
        "SELECT 1 FROM training_verified_surveys",
        "WHERE handoff_id=$1 AND provider_event_id=$2",
        "AND response_reference=$3 AND lesson_number=$4 LIMIT 1"
      ].join(" "),[handoff.id,body.eventId,body.responseReference,body.lessonNumber]);
      await db.query("ROLLBACK");
      return previous.rowCount===1
        ?NextResponse.json({accepted:true,duplicate:true},{
          headers:{"Cache-Control":"no-store"}})
        :fail("CORRELATION_ALREADY_CONSUMED",409);
    }
    if(!handoff.active||handoff.deleted_at!==null||handoff.lesson_status!=="published"){
      await db.query("ROLLBACK");
      return fail("CORRELATION_EXPIRED_OR_REVOKED",410);
    }
    const inserted=await db.query([
      "INSERT INTO training_verified_surveys",
      "(learner_id,lesson_number,provider_event_id,response_reference,handoff_id)",
      "VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id"
    ].join(" "),[
      handoff.learner_id,body.lessonNumber,body.eventId,body.responseReference,handoff.id
    ]);
    if(inserted.rowCount!==1){
      await db.query("ROLLBACK");
      return fail("SURVEY_REFERENCE_CONFLICT",409);
    }
    const updated=await db.query([
      "UPDATE training_survey_handoffs SET consumed_at=NOW()",
      "WHERE id=$1 AND consumed_at IS NULL RETURNING id"
    ].join(" "),[handoff.id]);
    if(updated.rowCount!==1)throw new Error("CORRELATION_CONSUMPTION_FAILED");
    await db.query("COMMIT");
    return NextResponse.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
  }catch{
    await db.query("ROLLBACK");
    return fail("SURVEY_VERIFICATION_UNAVAILABLE",503);
  }finally{db.release();}
}
