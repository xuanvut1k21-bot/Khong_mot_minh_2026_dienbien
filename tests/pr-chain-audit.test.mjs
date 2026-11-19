import assert from "node:assert/strict";
import test from "node:test";
import {auditStack} from "../lib/pr-chain-audit.mjs";
const sha=n=>Number(n).toString(16).padStart(40,"0");
function fixture(){
 const pulls=[1,2,3].map(n=>({
  number:n,state:"open",draft:false,merged_at:null,user:{login:"author"},
  head:{ref:"feat/phase-"+n,sha:sha(n+9)},
  base:{ref:n===1?"main":"feat/phase-"+(n-1),sha:sha(n===1?1:n+8)}
 }));
 const main={name:"main",protected:true,commit:{sha:sha(1)}};
 const protection={
  required_status_checks:{strict:true,contexts:["build"],checks:[]},
  required_pull_request_reviews:{required_approving_review_count:1,dismiss_stale_reviews:true},
  enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},
  allow_deletions:{enabled:false}
 };
 const comparisons=Object.fromEntries(pulls.map(p=>[p.number,{
  status:"ahead",behind_by:0,ahead_by:1,
  base_commit:{sha:p.base.sha},merge_base_commit:{sha:p.base.sha}
 }]));
 const reviewsByPr=Object.fromEntries(pulls.map(p=>[p.number,[{
  id:10+p.number,state:"APPROVED",submitted_at:"2026-11-19T10:00:00Z",
  commit_id:p.head.sha,user:{login:"independent"}
 }]]));
 const runsByPr=Object.fromEntries(pulls.map(p=>[p.number,[{
  id:p.number,name:"Website checks",head_sha:p.head.sha,status:"completed",
  conclusion:"success",created_at:"2026-11-19T10:00:00Z"
 }]]));
 const checksByPr=Object.fromEntries(pulls.map(p=>[p.number,[{
  id:p.number,name:"build",head_sha:p.head.sha,app:{slug:"github-actions"},
  status:"completed",conclusion:"success",started_at:"2026-11-19T10:00:00Z"
 }]]));
 return {pulls,main,protection,comparisons,reviewsByPr,runsByPr,checksByPr};
}
test("complete stack passes technical precheck",()=>{
 const result=auditStack(fixture());
 assert.equal(result.ready,true,JSON.stringify(result.blockers));
 assert.equal(result.headCiSuccessCount,3);
});
test("draft and no approval block",()=>{
 const f=fixture();f.pulls[1].draft=true;f.reviewsByPr[1]=[];
 const r=auditStack(f);assert.equal(r.ready,false);
 assert.ok(r.blockers.some(x=>x.id==="draft_2"));
 assert.ok(r.blockers.some(x=>x.id==="review_missing_1"));
});
test("branch protection must enforce exact check and stale dismissal",()=>{
 const f=fixture();f.main.protected=false;
 f.protection.required_status_checks.contexts=["lint"];
 f.protection.required_pull_request_reviews.dismiss_stale_reviews=false;
 const r=auditStack(f);
 for(const id of ["main_unprotected","main_required_checks_missing","main_review_policy_missing"])
  assert.ok(r.blockers.some(x=>x.id===id),id);
});
test("new changes requested supersedes approval",()=>{
 const f=fixture();
 f.reviewsByPr[1].push({id:99,state:"CHANGES_REQUESTED",
  submitted_at:"2026-11-19T11:00:00Z",commit_id:f.pulls[0].head.sha,
  user:{login:"independent"}});
 const r=auditStack(f);
 assert.ok(r.blockers.some(x=>x.id==="changes_requested_1"));
 assert.ok(r.blockers.some(x=>x.id==="review_missing_1"));
});
test("later approved review clears earlier change request",()=>{
 const f=fixture();
 f.reviewsByPr[1].unshift({id:1,state:"CHANGES_REQUESTED",
  submitted_at:"2026-11-19T09:00:00Z",commit_id:f.pulls[0].head.sha,
  user:{login:"independent"}});
 assert.equal(auditStack(f).ready,true);
});
test("old SHA review and author review never count",()=>{
 const f=fixture();f.reviewsByPr[1][0].commit_id=sha(4);
 f.reviewsByPr[2][0].user.login="author";
 const r=auditStack(f);
 for(const id of ["review_missing_1","review_missing_2"])
  assert.ok(r.blockers.some(x=>x.id===id),id);
});
test("missing correct check run fails even with green workflow",()=>{
 const f=fixture();f.checksByPr[2]=[];
 const r=auditStack(f);
 assert.ok(r.blockers.some(x=>x.id==="head_ci_not_green_2"));
});
test("new failed workflow supersedes older success",()=>{
 const f=fixture();f.runsByPr[3].push({
  id:99,name:"Website checks",head_sha:f.pulls[2].head.sha,
  status:"completed",conclusion:"failure",created_at:"2026-11-20T10:00:00Z"
 });
 assert.ok(auditStack(f).blockers.some(x=>x.id==="head_ci_not_green_3"));
});
test("broken ancestry and wrong base block",()=>{
 const f=fixture();f.comparisons[2].behind_by=1;
 f.pulls[2].base.ref="main";
 const r=auditStack(f);
 for(const id of ["ancestry_unverified_2","wrong_pr_base_3"])
  assert.ok(r.blockers.some(x=>x.id===id));
});
test("merged prefix is recognized but next PR must retarget main",()=>{
 const f=fixture();
 f.pulls[0].state="closed";f.pulls[0].merged_at="2026-11-20T12:00:00Z";
 f.main.commit.sha=f.pulls[0].head.sha;
 f.pulls[1].base={ref:"main",sha:f.main.commit.sha};
 f.comparisons[2]={status:"ahead",behind_by:0,ahead_by:1,
  base_commit:{sha:f.main.commit.sha},merge_base_commit:{sha:f.main.commit.sha}};
 const r=auditStack(f);
 assert.equal(r.ready,true,JSON.stringify(r.blockers));
 assert.equal(r.mergedCount,1);
});
test("merging later PR before predecessor blocks",()=>{
 const f=fixture();f.pulls[2].state="closed";f.pulls[2].merged_at="2026-11-20T12:00:00Z";
 assert.ok(auditStack(f).blockers.some(x=>x.id==="merge_order_3"));
});
