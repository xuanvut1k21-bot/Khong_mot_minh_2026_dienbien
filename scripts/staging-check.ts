// No deployment performed. No secrets or full DSNs are ever printed.
// Usage: npm run staging:check [-- --check-db]
import { Pool } from "pg";
import { stagingReadiness, type StagingCheck } from "../lib/staging-readiness";

async function databaseReadiness():Promise<StagingCheck[]>{
  if(!process.env.DATABASE_URL)return [{
    id:"database_connection",ok:false,reason:"Thiếu kết nối CSDL"
  }];
  const db=new Pool({
    connectionString:process.env.DATABASE_URL,max:1,
    connectionTimeoutMillis:4000,idleTimeoutMillis:1000
  });
  try{
    const response=await db.query({
      text:[
        "SELECT to_regclass('public.activities') IS NOT NULL AS activities,",
        "to_regclass('public.media_assets') IS NOT NULL AS media,",
        "to_regclass('public.admin_users') IS NOT NULL AS admin,",
        "to_regclass('public.training_learners') IS NOT NULL AS training,",
        "to_regclass('public.training_survey_handoffs') IS NOT NULL AS surveys,",
        "to_regclass('public.training_learner_rate_limits') IS NOT NULL AS limits"
      ].join(" "),
      query_timeout:5000
    });
    const row=response.rows[0]??{};
    return Object.entries(row).map(([key,ok])=>({
      id:"schema_"+key,ok:ok===true,
      reason:ok===true?"Đã tồn tại":"Thiếu bảng cần thiết hoặc migration chưa chạy"
    }));
  }catch{
    return [{id:"database_connection",ok:false,
      reason:"Không thể kết nối/đọc CSDL qua kênh đã cấu hình"}];
  }finally{
    await db.end().catch(()=>{});
  }
}
async function main(){
  const report=stagingReadiness(process.env);
  const checks=[...report.checks];
  if(process.argv.includes("--check-db"))
    checks.push(...await databaseReadiness());
  const ready=checks.every(x=>x.ok);
  console.log(JSON.stringify({
    environment:"staging",ready,checks,
    note:"Chỉ kiểm tra cấu hình và schema; không kiểm tra MFA, WAF hoặc backup thật."
  },null,2));
  if(!ready)process.exitCode=1;
}
void main().catch(()=>{
  console.error("Staging preflight failed. No secret information logged.");
  process.exitCode=1;
});
