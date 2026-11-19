// Isolated HTTP integration run against Next.js dev + disposable PostgreSQL CI DB.
// All personal information, questions and survey callbacks are SYNTHETIC ONLY.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";

const ROOT = "http://localhost:4127";
const db = new Pool({connectionString:process.env.DATABASE_URL,max:3});
const SURVEY_SECRET = process.env.TRAINING_SURVEY_WEBHOOK_SECRET ?? "";
const SOURCE = "https://drive.google.com/file/d/12345678901234567890/view";
const ORIGIN = ROOT;
let dev:ChildProcess|undefined;
let serverOutput="";
let authorId:string|null=null;
let approverId:string|null=null;

function expectStatus(actual:Response, expected:number, context:string){
  assert.equal(actual.status,expected,
    context+": unexpected HTTP "+actual.status);
  if(actual.ok)assert.equal(
    actual.headers.get("cache-control")?.includes("no-store"),true,
    context+": missing no-store on success"
  );
}
async function endpoint(path:string,opts?:RequestInit):Promise<Response>{
  return fetch(ROOT+path,{cache:"no-store",redirect:"manual",...opts});
}
async function post(path:string,body:unknown,cookie?:string,origin=ORIGIN){
  return endpoint(path,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Origin:origin,
      ...(cookie?{Cookie:cookie}:{})
    },
    body:JSON.stringify(body)
  });
}
async function get(path:string,cookie?:string){
  return endpoint(path,{headers:cookie?{Cookie:cookie}:{}});
}
async function remove(path:string,cookie:string){
  return endpoint(path,{method:"DELETE",headers:{Origin:ORIGIN,Cookie:cookie}});
}
async function signedSurvey(
  token:string,lessonNumber:1|9,eventId:string,responseReference:string,
  override:Record<string,unknown>={}
):Promise<Response>{
  const body=JSON.stringify({
    eventId,correlationToken:token,lessonNumber,responseReference,
    submissionVerified:true,...override
  });
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature=createHmac("sha256",SURVEY_SECRET)
    .update(timestamp+"."+body).digest("hex");
  return endpoint("/api/v1/training/survey-verified",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-km-timestamp":timestamp,
      "x-km-signature":signature
    },body
  });
}
async function getCookie(response:Response):Promise<string>{
  const cookie=response.headers.get("set-cookie");
  if(!cookie)throw new Error("Missing registration session cookie");
  assert.match(cookie,/httponly/i,"Training cookie must be HttpOnly");
  assert.match(cookie,/samesite=lax/i,"Training cookie must be SameSite=Lax");
  assert.ok(!/;\s*secure\b/i.test(cookie),
    "Local CI must use a development-only non-Secure cookie");
  return cookie.split(";")[0];
}
async function startServer(){
  dev=spawn(process.execPath,[
    "node_modules/next/dist/bin/next","dev","--hostname","localhost","--port","4127"
  ],{env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});
  for(const stream of [dev.stdout,dev.stderr]){
    stream?.on("data",(data:Buffer)=>{
      serverOutput=(serverOutput+data.toString("utf8")).slice(-12000);
    });
  }
  for(let i=0;i<100;i++){
    if(dev.exitCode!==null)throw new Error("Next.js exited before readiness");
    try{
      const res=await endpoint("/api/v1/training/overview");
      if(res.status===200)return;
    }catch{}
    await sleep(700);
  }
  throw new Error("Next.js did not become ready (last output: "+
    serverOutput.slice(-1800)+")");
}
async function createSyntheticCurriculum(){
  const reviewer=await db.query(
    "INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled) VALUES($1,$2,TRUE) RETURNING id",
    ["https://test.example","journey-reviewer"]
  );
  const author=await db.query(
    "INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled) VALUES($1,$2,TRUE) RETURNING id",
    ["https://test.example","journey-author"]
  );
  approverId=reviewer.rows[0].id;
  authorId=author.rows[0].id;
  const published=await db.query([
    "UPDATE training_lessons SET title='Synthetic course session '||lesson_number,",
    "approved_material_url=$1,editor_id=$2,approved_by=$3,",
    "published_at=NOW(),status='published',updated_at=NOW()",
    "RETURNING lesson_number"
  ].join(" "),[SOURCE,authorId,approverId]);
  assert.equal(published.rowCount,9,"Exactly 9 lessons must publish in test DB");
  const bank=await db.query([
    "INSERT INTO training_questions(",
    "question_text,option_a,option_b,option_c,option_d,correct_index,",
    "approval_status,created_by,approved_by,approved_at,source_reference)",
    "SELECT 'Synthetic training question '||g,",
    "'Synthetic option A','Synthetic option B',",
    "'Synthetic option C','Synthetic option D',",
    "(g%4)+1,'approved',$1,$2,NOW(),$3",
    "FROM generate_series(1,90) AS g RETURNING id"
  ].join(" "),[authorId,approverId,SOURCE]);
  assert.equal(bank.rowCount,90,"Exactly 90 synthetic approved questions");
}
async function issueSurvey(lesson:1|9,cookie:string){
  const response=await post(
    "/api/v1/training/surveys/"+lesson+"/launch",{},cookie
  );
  expectStatus(response,200,"Survey launch "+lesson);
  const body=await response.json();
  assert.equal(typeof body.url,"string");
  const parsed=new URL(body.url);
  assert.equal(parsed.hostname,"surveys.example.test");
  const token=parsed.searchParams.get("km_ref");
  assert.match(token??"",/^[A-Za-z0-9_-]{43}$/);
  assert.ok(!body.url.includes("Synthetic"),"No learner names in provider URL");
  assert.equal(body.instructions.includes("không đồng nghĩa"),true);
  return token as string;
}
async function integration(){
  assert.ok(SURVEY_SECRET.length>=32,"Synthetic secret not configured");
  const initial=await db.query(
    "SELECT (SELECT COUNT(*)::int FROM training_questions) AS questions, "+
    "(SELECT COUNT(*)::int FROM training_lessons) AS lessons"
  );
  assert.equal(initial.rows[0].questions,0,"CI database must start without question data");
  assert.equal(initial.rows[0].lessons,9,"Expected 9 lesson slots");

  await startServer();
  let response=await get("/api/v1/training/overview");
  expectStatus(response,200,"Initial overview");
  let snapshot=await response.json();
  assert.equal(snapshot.examOpen,false);
  assert.equal(snapshot.bankReady,false);
  assert.equal(snapshot.registered,false);
  assert.equal(Object.hasOwn(snapshot,"learnerReference"),false);

  response=await post("/api/v1/training/register",{
    fullName:"Synthetic Learner",schoolName:"Synthetic School CI",
    privacyAcknowledged:true
  },undefined,"https://untrusted.example.test");
  expectStatus(response,403,"CSRF protection");

  response=await post("/api/v1/training/register",{
    fullName:"Synthetic Learner",schoolName:"Synthetic School CI",
    privacyAcknowledged:true
  });
  expectStatus(response,201,"Registration");
  const firstCookie=await getCookie(response);
  const learnerLookup=await db.query(
    "SELECT id FROM training_learners WHERE full_name=$1 AND school_name=$2",
    ["Synthetic Learner","Synthetic School CI"]
  );
  assert.equal(learnerLookup.rowCount,1);
  const firstLearnerId:string=learnerLookup.rows[0].id;

  response=await get("/api/v1/training/me",firstCookie);
  expectStatus(response,200,"Learner me");
  snapshot=await response.json();
  assert.equal(snapshot.registered,true);
  assert.deepEqual(snapshot.verifiedSurveys,[]);
  assert.equal(Object.hasOwn(snapshot,"learnerReference"),false);

  response=await post("/api/v1/training/surveys/1/launch",{},firstCookie);
  expectStatus(response,409,"Survey requires published lesson");
  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,409,"Exam initially locked");

  await createSyntheticCurriculum();
  response=await get("/api/v1/training/overview",firstCookie);
  snapshot=await response.json();
  assert.equal(snapshot.bankReady,true);
  assert.equal(snapshot.examOpen,false);
  assert.equal(snapshot.lessons.filter((x:{published:boolean})=>x.published).length,9);

  response=await get("/api/v1/training/surveys/1/qr");
  expectStatus(response,200,"Static survey QR");
  assert.match(response.headers.get("content-type")??"",/image\/svg\+xml/);
  const qrSvg=await response.text();
  assert.match(qrSvg,/<svg/);
  assert.ok(!qrSvg.includes("Synthetic"),"QR must not contain personal data");
  assert.ok(!qrSvg.includes("km_ref"),"QR must not contain correlation token");

  const token1=await issueSurvey(1,firstCookie);
  response=await post("/api/v1/training/surveys/1/launch",{},firstCookie);
  expectStatus(response,429,"Survey rate limit");
  response=await endpoint("/api/v1/training/survey-verified",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({eventId:"invalid-event"})
  });
  expectStatus(response,401,"Unsigned webhook rejection");

  response=await signedSurvey(token1,1,"synthetic-event-001","synthetic-response-001",{
    submissionVerified:false
  });
  expectStatus(response,400,"Unverified provider submission rejected");

  response=await signedSurvey(token1,1,"synthetic-event-001","synthetic-response-001");
  expectStatus(response,200,"Signed survey 1 verified");
  assert.equal((await response.json()).accepted,true);
  response=await signedSurvey(token1,1,"synthetic-event-001","synthetic-response-001");
  expectStatus(response,200,"Exact replay idempotent");
  assert.equal((await response.json()).duplicate,true);
  response=await signedSurvey(token1,1,"synthetic-event-002","synthetic-response-002");
  expectStatus(response,409,"Different event cannot reuse token");

  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,409,"One verified survey is insufficient");
  const token9=await issueSurvey(9,firstCookie);
  response=await signedSurvey(token9,9,"synthetic-event-009","synthetic-response-009");
  expectStatus(response,200,"Signed survey 9 verified");

  response=await get("/api/v1/training/overview",firstCookie);
  expectStatus(response,200,"Overview after both surveys");
  snapshot=await response.json();
  assert.deepEqual([...snapshot.surveysVerified].sort((a:number,b:number)=>a-b),[1,9]);
  assert.equal(snapshot.examOpen,true);

  await db.query([
    "INSERT INTO training_learner_rate_limits(learner_id,action,used,window_started_at)",
    "VALUES($1,'exam_start',12,NOW())",
    "ON CONFLICT(learner_id,action) DO UPDATE SET",
    "used=EXCLUDED.used,window_started_at=NOW()"
  ].join(" "),[firstLearnerId]);
  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,429,"Exam start budget enforced");
  assert.equal(response.headers.get("retry-after"),"60");
  await db.query(
    "DELETE FROM training_learner_rate_limits WHERE learner_id=$1 AND action='exam_start'",
    [firstLearnerId]
  );
  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,201,"Start first attempt");
  let exam=await response.json();
  assert.equal(exam.questions.length,20);
  assert.ok(Date.parse(exam.expiresAt)>Date.now());
  assert.ok(!JSON.stringify(exam).includes("correctIndex"));
  assert.ok(!JSON.stringify(exam).includes("correct_index"));

  const attemptId=exam.attemptId;
  response=await get("/api/v1/training/attempts/"+attemptId,firstCookie);
  expectStatus(response,200,"Retrieve in-progress paper");
  const resumed=await response.json();
  assert.equal(resumed.questions.length,20);

  await db.query(
    "UPDATE training_registration_limits SET used=300,window_started_at=NOW() WHERE bucket_key='global'"
  );
  response=await post("/api/v1/training/register",{
    fullName:"Synthetic Other Learner",schoolName:"Synthetic School CI",
    privacyAcknowledged:true
  });
  expectStatus(response,429,"Global registration safety budget");
  assert.equal(response.headers.get("retry-after"),"600");
  await db.query(
    "UPDATE training_registration_limits SET used=1,window_started_at=NOW() WHERE bucket_key='global'"
  );
  response=await post("/api/v1/training/register",{
    fullName:"Synthetic Other Learner",schoolName:"Synthetic School CI",
    privacyAcknowledged:true
  });
  expectStatus(response,201,"Second learner registration");
  const otherCookie=await getCookie(response);
  response=await get("/api/v1/training/attempts/"+attemptId,otherCookie);
  expectStatus(response,404,"Cross-user paper access blocked");
  response=await post("/api/v1/training/attempts",{},otherCookie);
  expectStatus(response,409,"Other learner without surveys blocked");

  const items=await db.query(
    "SELECT position,correct_index FROM training_attempt_items WHERE attempt_id=$1 ORDER BY position",
    [attemptId]
  );
  assert.equal(items.rowCount,20);
  const first15=items.rows.slice(0,15).map(r=>({
    position:Number(r.position),choiceIndex:Number(r.correct_index)
  }));
  await db.query([
    "INSERT INTO training_learner_rate_limits(learner_id,action,used,window_started_at)",
    "VALUES($1,'exam_submit',30,NOW())",
    "ON CONFLICT(learner_id,action) DO UPDATE SET",
    "used=EXCLUDED.used,window_started_at=NOW()"
  ].join(" "),[firstLearnerId]);
  response=await post("/api/v1/training/attempts/"+attemptId,{answers:first15},firstCookie);
  expectStatus(response,429,"Exam submit budget enforced");
  await db.query(
    "DELETE FROM training_learner_rate_limits WHERE learner_id=$1 AND action='exam_submit'",
    [firstLearnerId]
  );
  response=await post("/api/v1/training/attempts/"+attemptId,{
    answers:[first15[0],first15[0]]
  },firstCookie);
  expectStatus(response,400,"Duplicate answers rejected");
  response=await post("/api/v1/training/attempts/"+attemptId,{
    answers:first15
  },firstCookie);
  expectStatus(response,200,"Failing 15/20 attempt");
  let outcome=await response.json();
  assert.equal(outcome.passed,false);
  assert.equal(Object.hasOwn(outcome,"correctCount"),false);

  response=await post("/api/v1/training/attempts/"+attemptId,{
    answers:first15
  },firstCookie);
  expectStatus(response,409,"No double submission");

  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,201,"Unlimited retry");
  exam=await response.json();
  const nextItems=await db.query(
    "SELECT position,correct_index FROM training_attempt_items WHERE attempt_id=$1 ORDER BY position",
    [exam.attemptId]
  );
  const first16=nextItems.rows.slice(0,16).map(r=>({
    position:Number(r.position),choiceIndex:Number(r.correct_index)
  }));
  response=await post("/api/v1/training/attempts/"+exam.attemptId,{
    answers:first16
  },firstCookie);
  expectStatus(response,200,"Passing 16/20 attempt");
  outcome=await response.json();
  assert.equal(outcome.passed,true);
  assert.equal(outcome.message,
    "Congratulations! Chúc mừng bạn đã hoàn thành chương trình đào tạo giảng viên Không Một Mình 2026");
  assert.ok(!JSON.stringify(outcome).includes("correctCount"));
  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,201,"New attempt can begin after a pass");
  const expiredAttempt=(await response.json()).attemptId;
  await db.query([
    "UPDATE training_attempts SET started_at=NOW()-INTERVAL '17 minutes',",
    "expires_at=NOW()-INTERVAL '2 minutes' WHERE id=$1"
  ].join(" "),[expiredAttempt]);
  response=await post("/api/v1/training/attempts/"+expiredAttempt,{
    answers:[]
  },firstCookie);
  expectStatus(response,410,"Late submission cannot be graded");
  response=await post("/api/v1/training/attempts",{},firstCookie);
  expectStatus(response,201,"Exam retries are not capped");

  response=await remove("/api/v1/training/me",firstCookie);
  expectStatus(response,200,"Own account deletion");
  assert.equal((await response.json()).deleted,true);
  response=await get("/api/v1/training/me",firstCookie);
  expectStatus(response,200,"Deleted cookie cannot read user");
  assert.equal((await response.json()).registered,false);

  const deleted=await db.query(
    "SELECT COUNT(*)::int AS count FROM training_learners WHERE school_name=$1",
    ["Synthetic School CI"]
  );
  assert.equal(deleted.rows[0].count,1,
    "First learner and related attempts/handoffs must be removed");
  console.log("Training HTTP journey: registration, signed surveys, exam, privacy and deletion passed.");
}
async function cleanup(){
  // The data exists only in the ephemeral CI database; also try to remove it.
  await db.query("DELETE FROM training_learners WHERE school_name=$1",
    ["Synthetic School CI"]);
  if(authorId){
    await db.query([
      "UPDATE training_lessons SET status='draft',title=NULL,approved_material_url=NULL,",
      "editor_id=NULL,approved_by=NULL,published_at=NULL WHERE editor_id=$1"
    ].join(" "),[authorId]);
    await db.query("DELETE FROM training_questions WHERE created_by=$1",[authorId]);
  }
  if(authorId)await db.query("DELETE FROM admin_users WHERE id=$1",[authorId]);
  if(approverId)await db.query("DELETE FROM admin_users WHERE id=$1",[approverId]);
}

async function main(){
try{
  await integration();
}catch(error){
  console.error("Training HTTP journey failed:",error);
  // Only ephemeral dev server logs, never response bodies or personal tokens.
  console.error("Next development server (tail):",serverOutput.slice(-1800));
  process.exitCode=1;
}finally{
  try{await cleanup();}catch(error){
    console.error("Synthetic fixture cleanup failed:",error);
    process.exitCode=1;
  }
  await db.end();
  if(dev){
    dev.kill("SIGTERM");
    await sleep(1500);
    if(dev.exitCode===null)dev.kill("SIGKILL");
  }
}

}
void main().catch(error=>{
  console.error("Uncaught training journey test failure:",error);
  process.exitCode=1;
});
