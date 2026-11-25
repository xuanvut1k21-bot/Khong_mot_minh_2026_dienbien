// Disposable CI-only retention integration: dry-run and explicit --apply.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const created:string[]=[];
async function createLearner(name:string,old:boolean){
  const result=await pool.query([
    "INSERT INTO training_learners(full_name,school_name,privacy_acknowledged_at,created_at)",
    "VALUES($1,'Synthetic Retention School',NOW(),",
    old?"NOW()-INTERVAL '210 days')":"NOW())",
    "RETURNING id"
  ].join(" "),[name]);
  created.push(result.rows[0].id);
  return result.rows[0].id as string;
}
function maintenance(apply:boolean){
  const args=["run","training:maintenance"];
  if(apply)args.push("--","--apply");
  const result=spawnSync("npm",args,{
    env:{...process.env,TRAINING_RETENTION_PURGE_ENABLED:apply?"true":"false"},
    encoding:"utf8",timeout:60000
  });
  if(result.status!==0)throw new Error(
    "Maintenance failed: "+result.stderr.slice(-1200)
  );
  const lines=result.stdout.trim().split("\n");
  return JSON.parse(lines.at(-1)??"{}") as Record<string,number|string|boolean>;
}
async function main(){
  try{
    const old=await createLearner("Old Synthetic Learner",true);
    const recent=await createLearner("Recent Synthetic Learner",false);
    const stale=await createLearner("Stale Synthetic Learner",false);
    await pool.query([
      "INSERT INTO training_sessions(learner_id,token_sha256,created_at,expires_at)",
      "VALUES($1,repeat('a',64),NOW()-INTERVAL '20 days',NOW()-INTERVAL '10 days')"
    ].join(" "),[old]);
    await pool.query([
      "INSERT INTO training_survey_handoffs",
      "(learner_id,lesson_number,token_sha256,issued_at,expires_at)",
      "VALUES($1,1,repeat('b',64),NOW()-INTERVAL '10 days',",
      "NOW()-INTERVAL '9 days')"
    ].join(" "),[old]);
    const consumed=await pool.query([
      "INSERT INTO training_survey_handoffs",
      "(learner_id,lesson_number,token_sha256,issued_at,expires_at,consumed_at)",
      "VALUES($1,1,repeat('c',64),NOW()-INTERVAL '1 hour',",
      "NOW()+INTERVAL '1 hour',NOW()) RETURNING id"
    ].join(" "),[recent]);
    await pool.query([
      "INSERT INTO training_verified_surveys",
      "(learner_id,lesson_number,provider_event_id,response_reference,handoff_id)",
      "VALUES($1,1,'retention-event-1','retention-response-1',$2)"
    ].join(" "),[recent,consumed.rows[0].id]);
    const attempt=await pool.query([
      "INSERT INTO training_attempts(learner_id,started_at,expires_at)",
      "VALUES($1,NOW()-INTERVAL '20 minutes',NOW()-INTERVAL '5 minutes') RETURNING id"
    ].join(" "),[stale]);

    const before=maintenance(false);
    assert.equal(before.mode,"dry-run");
    assert.ok(Number(before.inactive_learners)>=0);
    let stillOld=await pool.query(
      "SELECT id FROM training_learners WHERE id=$1",[old]
    );
    assert.equal(stillOld.rowCount,1,"Dry run modified personal data");

    const applied=maintenance(true);
    assert.equal(applied.mode,"applied");
    assert.ok(Number(applied.deletedSessions)>=1);
    assert.ok(Number(applied.deletedUnconsumedHandoffs)>=1);
    assert.ok(Number(applied.expiredAttempts)>=1);
    stillOld=await pool.query(
      "SELECT id FROM training_learners WHERE id=$1",[old]
    );
    assert.equal(stillOld.rowCount,0,"Old inactive learner not deleted");
    const active=await pool.query([
      "SELECT COUNT(*)::int AS count FROM training_verified_surveys",
      "WHERE learner_id=$1 AND handoff_id=$2"
    ].join(" "),[recent,consumed.rows[0].id]);
    assert.equal(active.rows[0].count,1,
      "Consumed verification must survive temporary-token cleanup");
    const status=await pool.query(
      "SELECT status FROM training_attempts WHERE id=$1",[attempt.rows[0].id]
    );
    assert.equal(status.rows[0].status,"expired");
    console.log("Training retention integration: dry-run, expired token cleanup, learner purge and preserved verified results passed.");
  }finally{
    await pool.query(
      "DELETE FROM training_learners WHERE id=ANY($1::uuid[])",[created]
    );
    await pool.end();
  }
}
void main().catch(error=>{
  console.error("Retention integration failed:",error);
  process.exitCode=1;
});
