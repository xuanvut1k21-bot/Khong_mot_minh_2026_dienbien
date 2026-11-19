import assert from "node:assert/strict";
import test from "node:test";
import {auditStack} from "../lib/pr-chain-audit.mjs";
const sha=n=>Number(n).toString(16).padStart(40,"0");
function fixture(){
 const prs=[1,2,3].map(n=>({
   number:n,state:"open",draft:false,merged_at:null,
   user:{login:"author"},head:{ref:"feat/phase-"+n,sha:sha(n+9)},
   base:{ref:n===1?"main":"feat/phase-"+(n-1)}
 }));
 const main={name:"main",protected:true,
   protection:{required_status_checks:{enforcement_level:"non_admins",contexts:["build"]}}};
 const comparisons=Object.fromEntries(prs.map(p=>[
   p.number,{status:"ahead",behind_by:0,ahead_by:1,
     base_commit:{sha:sha(p.number===1?1:p.number+8)},
     merge_base_commit:{sha:sha(p.number===1?1:p.number+8)}}]));
 const reviewsByPr=Object.fromEntries(prs.map(p=>[
   p.number,[{state:"APPROVED",commit_id:p.head.sha,user:{login:"independent-reviewer"}}]]));
 const runsByPr=Object.fromEntries(prs.map(p=>[p.number,[
   {name:"Website checks",head_sha:p.head.sha,status:"completed",
    conclusion:"success",created_at:"2026-11-19T10:00:00Z",id:p.number}
 ]]));
 return {pulls:prs,main,comparisons,reviewsByPr,runsByPr};
}
test("complete approved fast-forward chain passes policy",()=>{
 const result=auditStack(fixture());
 assert.equal(result.ready,true,JSON.stringify(result.blockers));
 assert.equal(result.ancestriesVerifiedCount,3);
 assert.equal(result.headCiSuccessCount,3);
});
test("missing reviewer and draft prohibit merging despite green CI",()=>{
 const input=fixture();input.pulls[1].draft=true;input.reviewsByPr[1]=[];
 const result=auditStack(input);
 assert.equal(result.ready,false);
 assert.ok(result.blockers.some(x=>x.id==="draft_2"));
 assert.ok(result.blockers.some(x=>x.id==="review_missing_1"));
});
test("main not protected, required CI absent, and wrong PR parent block",()=>{
 const input=fixture();input.main.protected=false;
 input.main.protection.required_status_checks.contexts=[];
 input.pulls[2].base.ref="main";
 const result=auditStack(input);
 for(const id of ["main_unprotected","main_required_checks_missing","wrong_pr_base_3"])
   assert.ok(result.blockers.some(x=>x.id===id),id);
});
test("replaced parent, behind commit and stale prior-CI success are rejected",()=>{
 const input=fixture();
 input.comparisons[2].behind_by=1;
 input.runsByPr[3].push({
   name:"Website checks",head_sha:input.pulls[2].head.sha,
   status:"completed",conclusion:"failure",created_at:"2026-11-20T10:00:00Z",id:99
 });
 input.reviewsByPr[1][0].commit_id=sha(1); // stale approval, not latest head
 const result=auditStack(input);
 for(const id of ["ancestry_unverified_2","head_ci_not_green_3","review_missing_1"])
   assert.ok(result.blockers.some(x=>x.id===id),id);
});
test("review by PR author does not count, API omissions fail closed",()=>{
 const input=fixture();input.reviewsByPr[2][0].user.login="author";
 delete input.runsByPr[3];delete input.comparisons[1];
 const result=auditStack(input);
 for(const id of ["review_missing_2","head_ci_not_green_3","ancestry_unverified_1"])
   assert.ok(result.blockers.some(x=>x.id===id),id);
});
