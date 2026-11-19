import assert from "node:assert/strict";
import test from "node:test";
import {
  requirePatchedGhVersion,requireStagingGovernance
} from "../lib/release-governance-policy.mjs";

const fixtures={
  environment:{
    name:"staging",
    prevent_self_review:true,
    deployment_branch_policy:{protected_branches:true,custom_branch_policies:false},
    protection_rules:[{type:"required_reviewers",reviewers:[{type:"User",reviewer:{login:"reviewer"}}]}]
  },
  branch:{name:"main",protected:true},
  rules:[
    {type:"pull_request",parameters:{required_approving_review_count:1}},
    {type:"required_status_checks",parameters:{required_status_checks:[{context:"build"}]}}
  ]
};
test("gh CLI 2.97.0 is minimum due to CVE-2026-64655",()=>{
  for(const version of ["gh version 2.96.99 (2026-10-01)","gh version 2.96.0","gh version 2.60.0"])
    assert.throws(()=>requirePatchedGhVersion(version),/VULNERABLE_OR_OUTDATED/);
  assert.equal(requirePatchedGhVersion("gh version 2.97.0 (2026-10-10)"),"2.97.0");
  assert.equal(requirePatchedGhVersion("gh version 2.99.2 (2026-11-15)"),"2.99.2");
  assert.throws(()=>requirePatchedGhVersion("command not found"));
});
test("synthetic staging governance has independent review and CI requirements",()=>{
  const report=requireStagingGovernance(fixtures);
  assert.equal(report.protectedMain,true);
  assert.equal(report.requiredCiChecksConfigured,true);
  assert.equal(report.checkedAgainstLiveGitHub,false);
});
test("fails closed if environment, reviewers, main or CI protection is absent",()=>{
  for(const change of [
    {environment:{...fixtures.environment,name:"production"}},
    {environment:{...fixtures.environment,prevent_self_review:false}},
    {environment:{...fixtures.environment,deployment_branch_policy:{protected_branches:false}}},
    {environment:{...fixtures.environment,protection_rules:[]}},
    {branch:{name:"main",protected:false}},
    {rules:[fixtures.rules[0]]},
    {rules:[fixtures.rules[1]]},
    {rules:null}
  ]){
    assert.throws(()=>requireStagingGovernance({...fixtures,...change}));
  }
});
