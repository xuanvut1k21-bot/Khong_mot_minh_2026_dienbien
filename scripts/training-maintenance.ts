// Run on a scheduled, restricted backend worker, not inside web requests.
// Dry-run by default. --apply requires explicit, separately approved retention policy.
import { getDatabasePool } from "../lib/server/db";

const retention=Number(process.env.TRAINING_LEARNER_RETENTION_DAYS??"180");
const apply=process.argv.slice(2).includes("--apply");
if(!Number.isInteger(retention)||retention<180||retention>3650){
  console.error("TRAINING_LEARNER_RETENTION_DAYS must be 180–3650");
  process.exit(2);
}
if(apply && process.env.TRAINING_RETENTION_PURGE_ENABLED!=="true"){
  console.error("Refusing --apply: TRAINING_RETENTION_PURGE_ENABLED is not true");
  process.exit(2);
}

const inactiveLearnerCondition=[
  "l.created_at < NOW()-($1::integer * INTERVAL '1 day')",
  "AND NOT EXISTS (SELECT 1 FROM training_sessions s",
  "WHERE s.learner_id=l.id AND s.expires_at>NOW())",
  "AND NOT EXISTS (SELECT 1 FROM training_attempts a",
  "WHERE a.learner_id=l.id",
  "AND a.started_at >= NOW()-($1::integer * INTERVAL '1 day'))",
  "AND NOT EXISTS (SELECT 1 FROM training_survey_handoffs h",
  "WHERE h.learner_id=l.id",
  "AND h.issued_at >= NOW()-($1::integer * INTERVAL '1 day'))",
  "AND NOT EXISTS (SELECT 1 FROM training_verified_surveys v",
  "WHERE v.learner_id=l.id",
  "AND v.verified_at >= NOW()-($1::integer * INTERVAL '1 day'))"
].join(" ");

async function run(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_NOT_CONFIGURED");
  const pool=getDatabasePool(),db=await pool.connect();
  try{
    await db.query("BEGIN");
    const lock=await db.query("SELECT pg_try_advisory_xact_lock(810010) AS ok");
    if(!lock.rows[0]?.ok)throw new Error("MAINTENANCE_ALREADY_RUNNING");

    const report=await db.query([
      "SELECT",
      "(SELECT COUNT(*)::int FROM training_sessions",
      "WHERE expires_at<NOW()-INTERVAL '7 days'",
      "OR revoked_at<NOW()-INTERVAL '7 days') AS expired_sessions,",
      "(SELECT COUNT(*)::int FROM training_survey_handoffs",
      "WHERE consumed_at IS NULL AND expires_at<NOW()-INTERVAL '7 days')",
      "AS expired_unconsumed_handoffs,",
      "(SELECT COUNT(*)::int FROM training_attempts",
      "WHERE status='in_progress' AND expires_at<=NOW()) AS expired_attempts,",
      "(SELECT COUNT(*)::int FROM training_learners l WHERE",
      inactiveLearnerCondition,
      ") AS inactive_learners"
    ].join(" "),[retention]);

    if(!apply){
      await db.query("ROLLBACK");
      console.log(JSON.stringify({
        mode:"dry-run",retentionDays:retention,...report.rows[0],
        note:"Counts only. No identities, answers, or session tokens printed."
      }));
      return;
    }

    const sessions=await db.query([
      "DELETE FROM training_sessions WHERE expires_at<NOW()-INTERVAL '7 days'",
      "OR revoked_at<NOW()-INTERVAL '7 days'"
    ].join(" "));
    // Consumed handoffs are necessary to verify survey completion and MUST survive.
    const handoffs=await db.query([
      "DELETE FROM training_survey_handoffs",
      "WHERE consumed_at IS NULL AND expires_at<NOW()-INTERVAL '7 days'"
    ].join(" "));
    const attempts=await db.query([
      "UPDATE training_attempts SET status='expired'",
      "WHERE status='in_progress' AND expires_at<=NOW()"
    ].join(" "));
    // Hard-delete inactive learner records only after retention policy approval.
    // Limit batch size to avoid long blocking transactions.
    const learners=await db.query([
      "WITH to_remove AS (",
      "SELECT l.id FROM training_learners l WHERE",
      inactiveLearnerCondition,
      "ORDER BY l.created_at FOR UPDATE OF l SKIP LOCKED LIMIT 100)",
      "DELETE FROM training_learners l USING to_remove r WHERE l.id=r.id"
    ].join(" "),[retention]);
    await db.query("COMMIT");
    console.log(JSON.stringify({
      mode:"applied",retentionDays:retention,
      deletedSessions:sessions.rowCount??0,
      deletedUnconsumedHandoffs:handoffs.rowCount??0,
      expiredAttempts:attempts.rowCount??0,
      deletedInactiveLearners:learners.rowCount??0,
      moreLearnersMayRemain:(learners.rowCount??0)===100
    }));
  }catch(error){
    await db.query("ROLLBACK");
    throw error;
  }finally{
    db.release();
    await pool.end();
  }
}
void run().catch(()=>{
  console.error("Training maintenance failed; no identifiers logged.");
  process.exitCode=1;
});
