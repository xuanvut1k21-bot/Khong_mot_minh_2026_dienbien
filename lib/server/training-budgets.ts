import "server-only";
import { NextResponse } from "next/server";
import { getDatabasePool } from "@/lib/server/db";

export type TrainingLearnerAction="exam_start"|"exam_submit";
export const TRAINING_REGISTRATION_LIMIT=300; // per 10 minute global window
export const TRAINING_EXAM_START_LIMIT=12; // per learner, per minute
export const TRAINING_EXAM_SUBMIT_LIMIT=30; // per learner, per minute

// A coarse emergency brake, NOT a substitute for trusted ingress bot/IP controls.
export async function consumeRegistrationBudget():Promise<boolean>{
  const result=await getDatabasePool().query([
    "INSERT INTO training_registration_limits(bucket_key,window_started_at,used)",
    "VALUES('global',NOW(),1)",
    "ON CONFLICT(bucket_key) DO UPDATE SET",
    "used=CASE WHEN training_registration_limits.window_started_at <= NOW()-INTERVAL '10 minutes'",
    "THEN 1 ELSE training_registration_limits.used+1 END,",
    "window_started_at=CASE WHEN training_registration_limits.window_started_at <= NOW()-INTERVAL '10 minutes'",
    "THEN NOW() ELSE training_registration_limits.window_started_at END",
    "WHERE training_registration_limits.window_started_at <= NOW()-INTERVAL '10 minutes'",
    "OR training_registration_limits.used < 300",
    "RETURNING used"
  ].join(" "));
  return result.rowCount===1;
}
export async function consumeLearnerBudget(
  learnerId:string,action:TrainingLearnerAction
):Promise<boolean>{
  const limit=action==="exam_start"?TRAINING_EXAM_START_LIMIT:TRAINING_EXAM_SUBMIT_LIMIT;
  const result=await getDatabasePool().query([
    "INSERT INTO training_learner_rate_limits(learner_id,action,window_started_at,used)",
    "VALUES($1,$2,NOW(),1)",
    "ON CONFLICT(learner_id,action) DO UPDATE SET",
    "used=CASE WHEN training_learner_rate_limits.window_started_at <= NOW()-INTERVAL '1 minute'",
    "THEN 1 ELSE training_learner_rate_limits.used+1 END,",
    "window_started_at=CASE WHEN training_learner_rate_limits.window_started_at <= NOW()-INTERVAL '1 minute'",
    "THEN NOW() ELSE training_learner_rate_limits.window_started_at END",
    "WHERE training_learner_rate_limits.window_started_at <= NOW()-INTERVAL '1 minute'",
    "OR training_learner_rate_limits.used < $3",
    "RETURNING used"
  ].join(" "),[learnerId,action,limit]);
  return result.rowCount===1;
}
export function trainingTooManyRequests(retrySeconds:number):NextResponse{
  return NextResponse.json({error:"RATE_LIMITED",retryAfterSeconds:retrySeconds},{
    status:429,
    headers:{"Cache-Control":"private, no-store","Retry-After":String(retrySeconds)}
  });
}
