// Governance is a fail-closed preflight, not proof of an actual approval or signature.
// The live check reads GitHub API; policy unit tests use synthetic JSON only.
export const MIN_GH_VERSION=[2,97,0]; // CVE-2026-64655 fixed in gh 2.97.0

export function requirePatchedGhVersion(output){
  const match=String(output??"").match(/^gh version (\d+)\.(\d+)\.(\d+)(?:[-+][^\s]+)?(?:\s|$)/m);
  if(!match)throw new Error("GH_VERSION_UNDETERMINED");
  const parsed=match.slice(1,4).map(Number);
  for(let i=0;i<3;i++){
    if(parsed[i]>MIN_GH_VERSION[i])return parsed.join(".");
    if(parsed[i]<MIN_GH_VERSION[i])throw new Error("GH_CLI_VULNERABLE_OR_OUTDATED");
  }
  return parsed.join(".");
}

export function requireStagingGovernance({environment,branch,rules}){
  if(environment?.name!=="staging")
    throw new Error("STAGING_ENVIRONMENT_NOT_FOUND");
  if(environment.prevent_self_review!==true)
    throw new Error("SELF_APPROVAL_NOT_BLOCKED");
  if(!environment?.deployment_branch_policy?.protected_branches)
    throw new Error("STAGING_REQUIRES_PROTECTED_BRANCHES");
  const reviewers=(environment.protection_rules??[]).find(rule=>
    rule.type==="required_reviewers" &&
    Array.isArray(rule.reviewers) && rule.reviewers.length>0
  );
  if(!reviewers)throw new Error("STAGING_REQUIRED_REVIEWER_MISSING");
  if(branch?.name!=="main" || branch?.protected!==true)
    throw new Error("MAIN_NOT_PROTECTED");
  if(!Array.isArray(rules))throw new Error("MAIN_RULES_UNAVAILABLE");
  const hasReview=rules.some(rule=>
    rule.type==="pull_request" &&
    Number(rule.parameters?.required_approving_review_count)>=1
  );
  if(!hasReview)throw new Error("MAIN_PULL_REQUEST_APPROVAL_REQUIRED");
  const hasChecks=rules.some(rule=>
    rule.type==="required_status_checks" &&
    Array.isArray(rule.parameters?.required_status_checks) &&
    rule.parameters.required_status_checks.length>0
  );
  if(!hasChecks)throw new Error("MAIN_STATUS_CHECKS_REQUIRED");
  return {
    environment:"staging",
    protectedMain:true,
    requiredReviewersConfigured:true,
    selfReviewBlocked:true,
    branchReviewsRequired:true,
    requiredCiChecksConfigured:true,
    checkedAgainstLiveGitHub:false // only live script can report a live preflight
  };
}
