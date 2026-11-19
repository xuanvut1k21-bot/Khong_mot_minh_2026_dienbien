// Fail-closed policy for a sequential stack of GitHub pull requests.
// This is technical evidence only; it never substitutes for legal/security approval.
const sha40=/^[a-f0-9]{40}$/i;
const expectedCheck="build";
const validSha=value=>typeof value==="string"&&sha40.test(value);
const latest=(a,b)=>String(b.submitted_at??b.started_at??b.created_at??"").localeCompare(String(a.submitted_at??a.started_at??a.created_at??""))||Number(b.id??0)-Number(a.id??0);
function reviewState(reviews,pr){
  if(!Array.isArray(reviews))return {approvals:0,changesRequested:true};
  const byReviewer=new Map();
  for(const r of [...reviews].sort(latest)){
    const login=r?.user?.login?.toLowerCase();
    if(!login||login===pr.user?.login?.toLowerCase()||!r.submitted_at)continue;
    if(!byReviewer.has(login))byReviewer.set(login,r);
  }
  let approvals=0,changesRequested=false;
  for(const r of byReviewer.values()){
    if(r.state==="CHANGES_REQUESTED")changesRequested=true;
    if(r.state==="APPROVED"&&r.commit_id===pr.head.sha)approvals++;
  }
  return {approvals,changesRequested};
}

// Validate an active repository ruleset targeting exactly the default branch.
// Other rulesets may add restrictions; they cannot replace missing proof here.
export function validMainRuleset(ruleSet){
  if(ruleSet?.enforcement!=="active"||ruleSet?.target!=="branch"||
     ruleSet?.source_type!=="Repository"||
     !Array.isArray(ruleSet.conditions?.ref_name?.include)||
     !ruleSet.conditions.ref_name.include.includes("~DEFAULT_BRANCH")||
     !Array.isArray(ruleSet.bypass_actors)||ruleSet.bypass_actors.length!==0||
     ruleSet.current_user_can_bypass==="always"||
     !Array.isArray(ruleSet.rules))return false;
  const types=new Set(ruleSet.rules.map(r=>r.type));
  const pr=ruleSet.rules.find(r=>r.type==="pull_request")?.parameters;
  const status=ruleSet.rules.find(r=>r.type==="required_status_checks")?.parameters;
  return types.has("deletion")&&types.has("non_fast_forward")&&
    pr?.required_approving_review_count>=1&&pr.dismiss_stale_reviews_on_push===true&&
    status?.strict_required_status_checks_policy===true&&
    Array.isArray(status?.required_status_checks)&&
    status.required_status_checks.some(c=>c.context===expectedCheck&&c.integration_id===15368);
}

export function auditStack({pulls,main,protection,mainRuleset,comparisons,reviewsByPr,checksByPr,runsByPr}){
  if(!Array.isArray(pulls)||!pulls.length)throw new Error("PULL_REQUESTS_MISSING");
  const prs=[...pulls].sort((a,b)=>a.number-b.number),blockers=[],rows=[];
  const block=(id,reason)=>blockers.push({id,reason});
  if(main?.name!=="main"||main.protected!==true||!validSha(main.commit?.sha))
    block("main_unprotected","main is not verifiably protected");
  if(mainRuleset!==undefined){
    if(!validMainRuleset(mainRuleset))
      block("main_ruleset_incomplete","Active main ruleset lacks an enforced safety requirement");
  }else{
    const checks=protection?.required_status_checks;
    const contexts=[...(checks?.contexts??[]),...(checks?.checks??[]).map(x=>x.context)];
    if(checks?.strict!==true||!contexts.includes(expectedCheck))
      block("main_required_checks_missing","main must require current-branch build with strict checks");
    const reviewsPolicy=protection?.required_pull_request_reviews;
    if(!reviewsPolicy||reviewsPolicy.required_approving_review_count<1||
       reviewsPolicy.dismiss_stale_reviews!==true)
      block("main_review_policy_missing","main must require an approval and dismiss stale reviews");
    if(protection?.enforce_admins?.enabled!==true)
      block("main_admin_bypass","main protection must apply to administrators");
    if(protection?.allow_force_pushes?.enabled!==false||protection?.allow_deletions?.enabled!==false)
      block("main_mutation_policy_missing","force pushes and branch deletion must be disabled");
  }
  let sawOpen=false;
  for(let i=0;i<prs.length;i++){
    const p=prs[i],n=p?.number;
    if(!Number.isInteger(n)||n!==i+1){block("pr_sequence_gap","Noncontiguous PR numbers");continue;}
    const merged=p.state==="closed"&&Boolean(p.merged_at);
    if(p.state!=="open"&&p.state!=="closed")block("invalid_pr_state_"+n,"Unknown PR state");
    if(p.state==="closed"&&!merged)block("closed_without_merge_"+n,"Closed PR was not merged");
    if(merged&&sawOpen)block("merge_order_"+n,"A merged PR follows an unmerged PR");
    if(!merged)sawOpen=true;
    if(!validSha(p.head?.sha)||!p.head?.ref?.startsWith("feat/"))
      block("invalid_pr_head_"+n,"Invalid PR head");
    // A previously merged prefix is historical. Its original base and CI are not
    // a basis for approval of the next unmerged PR.
    const prev=prs[i-1];
    const expectedBase=prev&&!Boolean(prev.merged_at)?prev.head?.ref:"main";
    if(!merged&&p.base?.ref!==expectedBase)
      block("wrong_pr_base_"+n,"Open PR must target the preceding open head, or main");
    const expectedBaseSha=expectedBase==="main"?main?.commit?.sha:prev?.head?.sha;
    if(!merged&&p.base?.sha!==expectedBaseSha)
      block("stale_pr_base_"+n,"PR base SHA no longer matches the expected parent");
    const comp=comparisons?.[n];
    const ancestry=merged?null:(comp?.status==="ahead"&&comp.behind_by===0&&
      Number.isInteger(comp.ahead_by)&&comp.ahead_by>0&&
      comp.base_commit?.sha===expectedBaseSha&&
      comp.merge_base_commit?.sha===expectedBaseSha);
    if(!merged&&!ancestry)block("ancestry_unverified_"+n,"Unverified head ancestry");
    const review=merged?{approvals:0,changesRequested:false}:reviewState(reviewsByPr?.[n],p);
    if(!merged&&p.draft)block("draft_"+n,"Draft PR cannot merge");
    if(!merged&&review.changesRequested)
      block("changes_requested_"+n,"An outstanding changes-requested review exists");
    if(!merged&&review.approvals<1)
      block("review_missing_"+n,"Current SHA lacks an independent latest approval");
    const runs=runsByPr?.[n],checkRuns=checksByPr?.[n];
    const latestRun=Array.isArray(runs)?runs.filter(r=>
      r.name==="Website checks"&&r.head_sha===p.head?.sha)
      .sort((a,b)=>String(b.created_at??"").localeCompare(String(a.created_at??""))||Number(b.id??0)-Number(a.id??0))[0]:null;
    const build=Array.isArray(checkRuns)?checkRuns.filter(c=>
      c.name===expectedCheck&&c.head_sha===p.head?.sha&&
      c.app?.slug==="github-actions")
      .sort((a,b)=>String(b.started_at??"").localeCompare(String(a.started_at??""))||Number(b.id??0)-Number(a.id??0))[0]:null;
    const ciPassed=latestRun?.status==="completed"&&latestRun.conclusion==="success"&&
      build?.status==="completed"&&build.conclusion==="success";
    if(!merged&&!ciPassed)block("head_ci_not_green_"+n,"Latest workflow and required build check must pass on current head");
    rows.push({number:n,base:p.base?.ref,head:p.head?.ref,sha:p.head?.sha,
      merged,draft:!!p.draft,ancestry,
      approvalsForCurrentHead:review.approvals,changesRequested:review.changesRequested,
      ci:ciPassed?"success":"unverified",ciRunId:latestRun?.id??null});
  }
  return {schemaVersion:2,generatedAt:null,ready:blockers.length===0,
    prCount:prs.length,mergedCount:rows.filter(x=>x.merged).length,
    draftCount:rows.filter(x=>x.draft&&!x.merged).length,
    approvedCount:rows.filter(x=>x.approvalsForCurrentHead>0).length,
    headCiSuccessCount:rows.filter(x=>x.ci==="success").length,
    ancestriesVerifiedCount:rows.filter(x=>x.ancestry===true).length,
    protectedMain:main?.protected===true,blockers,rows};
}
