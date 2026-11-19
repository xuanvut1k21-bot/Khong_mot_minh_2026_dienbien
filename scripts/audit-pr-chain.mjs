// Read-only; fail closed on unavailable governance evidence.
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync,appendFileSync} from "node:fs";
import {auditStack} from "../lib/pr-chain-audit.mjs";
const repo=process.env.GITHUB_REPOSITORY;
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??"")||!process.env.GH_TOKEN){
  console.error("PR_CHAIN_AUDIT_BLOCKED: missing repository or token");
  process.exit(1);
}
function get(path){
  const r=spawnSync("gh",["api","--method","GET","repos/"+repo+"/"+path],{
    encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024,env:process.env
  });
  if(r.error||r.status!==0)throw new Error("GITHUB_READ_FAILED: "+path.split("?")[0]);
  return JSON.parse(r.stdout);
}
function completeList(path){
  const result=[];
  for(let page=1;page<=20;page++){
    const separator=path.includes("?")?"&":"?";
    const batch=get(path+separator+"per_page=100&page="+page);
    if(!Array.isArray(batch))throw new Error("EXPECTED_LIST");
    result.push(...batch);
    if(batch.length<100)return result;
  }
  throw new Error("PAGINATION_LIMIT_REACHED");
}
async function main(){
  const pulls=completeList("pulls?state=all").sort((a,b)=>a.number-b.number);
  if(!pulls.length)throw new Error("EMPTY_PR_STACK");
  const branch=get("branches/main");
  // The full branch protection endpoint is intentionally mandatory. A public
  // 'protected:true' flag alone does not establish review/CI/admin controls.
  const protection=get("branches/main/protection");
  const comparisons={},reviewsByPr={},checksByPr={},runsByPr={};
  for(const p of pulls){
    if(p.state==="closed"&&p.merged_at)continue;
    const baseSha=p.base?.sha;
    if(!/^[a-f0-9]{40}$/i.test(baseSha??""))throw new Error("UNKNOWN_BASE_SHA");
    comparisons[p.number]=get("compare/"+baseSha+"..."+p.head.sha);
    reviewsByPr[p.number]=completeList("pulls/"+p.number+"/reviews");
    const checkData=get("commits/"+p.head.sha+"/check-runs?per_page=100");
    if(!Array.isArray(checkData.check_runs)||checkData.total_count>100)
      throw new Error("CHECK_RUN_PAGINATION_UNVERIFIED");
    checksByPr[p.number]=checkData.check_runs;
    // Query by SHA instead of by branch name to prevent stale branch successes.
    const runs=get("actions/runs?head_sha="+encodeURIComponent(p.head.sha)+"&per_page=100");
    if(!Array.isArray(runs.workflow_runs)||runs.total_count>100)
      throw new Error("WORKFLOW_RUN_PAGINATION_UNVERIFIED");
    runsByPr[p.number]=runs.workflow_runs;
  }
  const report=auditStack({pulls,main:branch,protection,comparisons,reviewsByPr,checksByPr,runsByPr});
  report.generatedAt=new Date().toISOString();
  mkdirSync("artifacts",{recursive:true});
  writeFileSync("artifacts/pr-chain-audit.json",JSON.stringify(report,null,2)+"\n",{mode:0o600});
  const summary=[
    "## PR chain audit — "+(report.ready?"TECHNICAL PRECHECK PASSED":"NO-GO"),"",
    "| Item | Result |","|---|---|",
    "| PRs | "+report.prCount+" |",
    "| Merged prefix | "+report.mergedCount+" |",
    "| Verified open ancestries | "+report.ancestriesVerifiedCount+" |",
    "| Passing head CI | "+report.headCiSuccessCount+" |",
    "| Approvals | "+report.approvedCount+" |",
    "| Blocking findings | "+report.blockers.length+" |","",
    "Read-only result. Human security/privacy review and staging evidence remain mandatory."
  ].join("\n")+"\n";
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log("PR_CHAIN_AUDIT: "+(report.ready?"PRECHECK_PASS":"BLOCKED")+", blockers "+report.blockers.length);
  if(!report.ready)process.exitCode=1;
}
main().catch(e=>{
  console.error("PR_CHAIN_AUDIT_BLOCKED: "+(e instanceof Error?e.message:"UNAVAILABLE"));
  process.exitCode=1;
});
