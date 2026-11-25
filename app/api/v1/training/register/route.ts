import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabasePool } from "@/lib/server/db";
import { parseJsonBody } from "@/lib/server/activity-editorial";
import { consumeRegistrationBudget,trainingTooManyRequests } from "@/lib/server/training-budgets";
import {
  trainingRegistrationEnabled, trainingOriginValid,
  getTrainingLearner, trainingCookieName, trainingSecureCookies,
  randomTrainingToken, tokenDigest, TRAINING_SESSION_SECONDS
} from "@/lib/server/training-security";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({
  fullName:z.string().trim().min(2).max(120),
  schoolName:z.string().trim().min(2).max(220),
  privacyAcknowledged:z.literal(true)
}).strict();

export async function POST(request:NextRequest){
  if(!trainingRegistrationEnabled())
    return NextResponse.json({error:"REGISTRATION_CLOSED"},{status:503});
  if(!trainingOriginValid(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  if(await getTrainingLearner(request))
    return NextResponse.json({error:"ALREADY_REGISTERED"},{status:409});
  const body=await parseJsonBody(request,schema);
  if(!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  try{
    if(!await consumeRegistrationBudget())return trainingTooManyRequests(600);
  }catch{
    return NextResponse.json({error:"REGISTRATION_UNAVAILABLE"},{status:503,
      headers:{"Cache-Control":"no-store"}});
  }
  const token=randomTrainingToken();
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const learner=await db.query(
      [
        "INSERT INTO training_learners(full_name,school_name,privacy_acknowledged_at)",
        "VALUES($1,$2,NOW()) RETURNING id"
      ].join(" "),[body.fullName,body.schoolName]
    );
    await db.query(
      [
        "INSERT INTO training_sessions(learner_id,token_sha256,expires_at)",
        "VALUES($1,$2,NOW()+INTERVAL '30 days')"
      ].join(" "),[learner.rows[0].id,tokenDigest(token)]
    );
    await db.query("COMMIT");
    const response=NextResponse.json(
      {registered:true,message:"Đã đăng ký. Chỉ khi học liệu và khảo sát được xác minh mới mở thi."},
      {status:201,headers:{"Cache-Control":"no-store"}}
    );
    response.cookies.set(trainingCookieName(),token,{
      httpOnly:true,secure:trainingSecureCookies(),sameSite:"lax",
      path:"/",maxAge:TRAINING_SESSION_SECONDS
    });
    return response;
  }catch{
    await db.query("ROLLBACK");
    return NextResponse.json({error:"REGISTRATION_UNAVAILABLE"},{status:503});
  }finally{db.release();}
}
