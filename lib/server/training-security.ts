import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDatabasePool } from "@/lib/server/db";

export const TRAINING_SESSION_SECONDS=30*24*60*60;
export const TRAINING_SUCCESS_MESSAGE=
  "Congratulations! Chúc mừng bạn đã hoàn thành chương trình đào tạo giảng viên Không Một Mình 2026";

export function trainingRegistrationEnabled():boolean {
  if(process.env.TRAINING_REGISTRATION_ENABLED!=="true" || !process.env.DATABASE_URL)
    return false;
  try{
    const site=new URL(process.env.APP_BASE_URL??"");
    const notice=new URL(process.env.TRAINING_PRIVACY_NOTICE_URL??"");
    return (
      (site.protocol==="https:" || (process.env.NODE_ENV!=="production" &&
        site.protocol==="http:" && site.hostname==="localhost")) &&
      notice.protocol==="https:"
    );
  }catch{return false;}
}
export function trainingExamEnabled():boolean {
  return trainingRegistrationEnabled() &&
    process.env.TRAINING_EXAM_ENABLED==="true";
}

export function trainingCookieName():string {
  return process.env.APP_BASE_URL?.startsWith("https://")
    ?"__Host-km_training":"km_training_dev";
}
export function trainingSecureCookies():boolean {
  return process.env.APP_BASE_URL?.startsWith("https://")===true;
}
export function trainingOriginValid(request:NextRequest):boolean {
  if(!trainingRegistrationEnabled())return false;
  try{
    const origin=new URL(process.env.APP_BASE_URL!).origin;
    return request.headers.get("origin")===origin &&
      request.nextUrl.origin===origin;
  }catch{return false;}
}
export function randomTrainingToken():string {
  return randomBytes(32).toString("base64url");
}
export function tokenDigest(raw:string):string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function getTrainingLearner(
  request:NextRequest
):Promise<{id:string}|null>{
  if(!trainingRegistrationEnabled())return null;
  const raw=request.cookies.get(trainingCookieName())?.value;
  if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;
  try{
    const result=await getDatabasePool().query(
      [
        "SELECT l.id FROM training_sessions s",
        "JOIN training_learners l ON l.id=s.learner_id",
        "WHERE s.token_sha256=$1 AND s.revoked_at IS NULL",
        "AND s.expires_at>NOW() AND l.deleted_at IS NULL LIMIT 1"
      ].join(" "),[tokenDigest(raw)]
    );
    return result.rows[0]??null;
  }catch{return null;}
}

export function verifySurveySignature(
  timestamp:string,rawBody:string,signature:string
):boolean{
  if(process.env.TRAINING_SURVEY_WEBHOOK_ENABLED!=="true")return false;
  const secret=process.env.TRAINING_SURVEY_WEBHOOK_SECRET;
  if(!secret||Buffer.byteLength(secret,"utf8")<32)return false;
  if(!/^\d{10}$/.test(timestamp)||!/^[0-9a-f]{64}$/.test(signature))return false;
  const time=Number(timestamp)*1000;
  if(!Number.isSafeInteger(time)||Math.abs(Date.now()-time)>300000)return false;
  const calculated=createHmac("sha256",secret).update(timestamp+"."+rawBody).digest();
  const supplied=Buffer.from(signature,"hex");
  return supplied.length===calculated.length&&timingSafeEqual(calculated,supplied);
}
