// Pure, fail-closed audit of stacked GitHub PRs. Synthetic fixtures for unit tests.
// This checks technical merge prerequisites, NOT human legal/security approval.
const sha40=/^[a-f0-9]{40}$/;
export function auditStack({pulls,main,comparisons,reviewsByPr,runsByPr}){
  if(!Array.isArray(pulls)||!pulls.length)throw new Error("PULL_REQUESTS_MISSING");
  const prs=[...pulls].sort((a,b)=>a.number-b.number);
  const blockers=[];
  const rows=[];
  const block=(id,reason)=>blockers.push({id,reason});
  if(main?.name!=="main"||main?.protected!==true)
    block("main_unprotected","GitHub main must be a protected branch");
  const req=main?.protection?.required_status_checks;
  if(!req||req.enforcement_level==="off"||
    !(Array.isArray(req.contexts)&&req.contexts.length>0) &&
    !(Array.isArray(req.checks)&&req.checks.length>0))
    block("main_required_checks_missing","GitHub main must enforce status checks");
  for(let i=0;i<prs.length;i++){
    const p=prs[i],previous=prs[i-1];
    const n=p?.number;
    if(!Number.isInteger(n)||n!==i+1){
      block("pr_sequence_gap","PR numbers must form one contiguous, reviewed stack beginning at #1");
      continue;
    }
    const ref=p.head?.ref,sha=p.head?.sha,base=p.base?.ref;
    if(typeof ref!=="string"||!ref.startsWith("feat/")||!sha40.test(sha??""))
      block("invalid_pr_head_"+n,"Missing or unexpected PR head ref/SHA");
    const expectedBase=previous?previous.head?.ref:"main";
    if(base!==expectedBase)
      block("wrong_pr_base_"+n,"PR base does not match preceding PR head");
    if(p.state!=="closed"&&p.state!=="open")
      block("invalid_pr_state_"+n,"Unknown PR state");
    const merged=p.merged_at!==null&&p.merged_at!==undefined;
    if(p.state==="closed"&&!merged)
      block("closed_without_merge_"+n,"Closed PR was not merged");
    const comp=comparisons?.[n];
    const ancestry=comp?.status==="ahead"&&comp.behind_by===0&&
      Number.isInteger(comp.ahead_by)&&comp.ahead_by>0&&
      comp.base_commit?.sha===comp.merge_base_commit?.sha;
    if(!ancestry)
      block("ancestry_unverified_"+n,"PR head is not a verified fast-forward descendant of its base");
    const reviews=reviewsByPr?.[n];
    const approved=Array.isArray(reviews)?
      new Set(reviews.filter(r=>r?.state==="APPROVED"&&
        r?.user?.login&&r.user.login!==p.user?.login&&r.commit_id===sha)
        .map(r=>r.user.login)).size:0;
    if(!merged&&p.draft)
      block("draft_"+n,"Draft PR cannot be merged");
    if(!merged&&approved<1)
      block("review_missing_"+n,"No distinct reviewer approval of the current head");
    const workflowRuns=runsByPr?.[n];
    const relevant=Array.isArray(workflowRuns)?workflowRuns.filter(r=>
      r.name==="Website checks"&&r.head_sha===sha):[];
    relevant.sort((a,b)=>String(b.created_at??"").localeCompare(String(a.created_at??"")));
    const latest=relevant[0];
    const ciPassed=latest?.status==="completed"&&latest.conclusion==="success";
    if(!ciPassed&&!merged)
      block("head_ci_not_green_"+n,"Latest matching Website checks run is not successful");
    rows.push({
      number:n,base,head:ref,sha,
      state:p.state,draft:!!p.draft,merged,ancestry,
      approvalsForCurrentHead:approved,
      ci:ciPassed?"success":(latest?.conclusion??latest?.status??"missing"),
      ciRunId:latest?.id??null
    });
  }
  return {
    schemaVersion:1,generatedAt:null,ready:blockers.length===0,
    prCount:prs.length,mergedCount:rows.filter(x=>x.merged).length,
    draftCount:rows.filter(x=>x.draft).length,
    approvedCount:rows.filter(x=>x.approvalsForCurrentHead>0).length,
    headCiSuccessCount:rows.filter(x=>x.ci==="success").length,
    ancestriesVerifiedCount:rows.filter(x=>x.ancestry).length,
    protectedMain:main?.protected===true,
    blockers,rows
  };
}
