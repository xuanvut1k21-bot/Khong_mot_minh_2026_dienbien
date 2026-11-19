// Read-only GitHub audit. Do not use as a substitute for independent review.
// Deliberately exits nonzero when any PR, CI, protection or review is inadequate.
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync,appendFileSync} from "node:fs";
import {auditStack} from "../lib/pr-chain-audit.mjs";

const repo=process.env.GITHUB_REPOSITORY;
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??"")||!process.env.GH_TOKEN){
  console.error("PR_CHAIN_AUDIT_BLOCKED: github repository or read-only credentials unavailable");
  process.exit(1);
}
function get(path){
  const result=spawnSync("gh",["api","--method","GET","repos/"+repo+"/"+path],{
    encoding:"utf8",timeout:30000,maxBuffer:2*1024*1024,env:process.env
  });
  if(result.error||result.status!==0)throw new Error("GITHUB_READ_FAILED");
  return JSON.parse(result.stdout);
}
async function main(){
  const pulls=get("pulls?state=all&per_page=100")
    .filter(p=>Number.isInteger(p.number)&&p.number>=1)
    .sort((a,b)=>a.number-b.number);
  if(pulls.length===0||pulls.length===100)
    throw new Error("EMPTY_OR_PAGINATED_PR_STACK");
  const branch=get("branches/main");
  const comparisons={};
  const reviewsByPr={};
  const runsByPr={};
  // Fetch serially to honor GitHub rate controls and avoid unbounded concurrency.
  for(let i=0;i<pulls.length;i++){
    const p=pulls[i];
    const baseSha=i===0?branch.commit.sha:pulls.find(x=>x.number===p.number-1)?.head?.sha;
    if(!baseSha)throw new Error("MISSING_ANCESTOR");
    comparisons[p.number]=get("compare/"+baseSha+"..."+p.head.sha);
    reviewsByPr[p.number]=get("pulls/"+p.number+"/reviews?per_page=100");
    if(reviewsByPr[p.number].length===100)
      throw new Error("PAGINATED_REVIEWS_REQUIRE_MANUAL_AUDIT");
    runsByPr[p.number]=get("actions/runs?branch="+
      encodeURIComponent(p.head.ref)+"&per_page=30").workflow_runs;
  }
  const report=auditStack({pulls,main:branch,comparisons,reviewsByPr,runsByPr});
  report.generatedAt=new Date().toISOString();
  mkdirSync("artifacts",{recursive:true});
  writeFileSync("artifacts/pr-chain-audit.json",JSON.stringify(report,null,2)+"\n",
    {mode:0o600,flag:"w"});
  const summary=[
    "## Pull request chain audit — "+(report.ready?"READY FOR HUMAN REVIEW":"NO-GO"),
    "",
    "| Item | Result |","|---|---|",
    "| PRs | "+report.prCount+" |",
    "| Ancestry verified | "+report.ancestriesVerifiedCount+" |",
    "| Latest head CI successful | "+report.headCiSuccessCount+" |",
    "| PRs with reviewer approval of current head | "+report.approvedCount+" |",
    "| Draft PRs | "+report.draftCount+" |",
    "| Protected main | "+(report.protectedMain?"Yes":"NO")+" |",
    "| Blockers | "+report.blockers.length+" |",
    "",
    "This is a read-only audit. It does not approve PRs, merge code, issue credentials or deploy."
  ].join("\n")+"\n";
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log("PR_CHAIN_AUDIT: "+(report.ready?"READY_FOR_INDEPENDENT_REVIEW":"BLOCKED")+
    ", PRs "+report.prCount+
    ", CI success "+report.headCiSuccessCount+
    ", approved "+report.approvedCount+
    ", blockers "+report.blockers.length);
  if(!report.ready)process.exitCode=1;
}
main().catch(error=>{
  console.error("PR_CHAIN_AUDIT_BLOCKED: "+(error instanceof Error?error.message:"UNAVAILABLE"));
  process.exitCode=1;
});
