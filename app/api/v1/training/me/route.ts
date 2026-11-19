import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";
import {
  trainingOriginValid,
  trainingCookieName,trainingSecureCookies,getTrainingLearner
} from "@/lib/server/training-security";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const learner=await getTrainingLearner(request);
  if(!learner)return NextResponse.json({registered:false},{
    headers:{"Cache-Control":"no-store"}
  });
  try{
    const result=await getDatabasePool().query(
      "SELECT v.lesson_number FROM training_verified_surveys v",
      "JOIN training_survey_handoffs h ON h.id=v.handoff_id",
      "WHERE v.learner_id=$1 AND h.consumed_at IS NOT NULL",
      "ORDER BY v.lesson_number",
      [learner.id]
    );
    return NextResponse.json({
      registered:true,
      verifiedSurveys:result.rows.map(x=>x.lesson_number)
    },{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"TRAINING_UNAVAILABLE"},{status:503});}
}

// Learner can withdraw their own data and attempts. No secret tokens in response/logs.
export async function DELETE(request:NextRequest){
  if(!process.env.DATABASE_URL)
    return NextResponse.json({error:"TRAINING_UNAVAILABLE"},{status:503});
  if(!trainingOriginValid(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const learner=await getTrainingLearner(request);
  if(!learner)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  try{
    await getDatabasePool().query("DELETE FROM training_learners WHERE id=$1",[learner.id]);
    const response=NextResponse.json({deleted:true},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(trainingCookieName(),"",{
      path:"/",maxAge:0,httpOnly:true,secure:trainingSecureCookies(),sameSite:"lax"
    });
    return response;
  }catch{return NextResponse.json({error:"DELETE_UNAVAILABLE"},{status:503});}
}
