// Read-only GitHub API audit; fails if protections are missing/unreadable.
// Never creates environments, reviewers, rulesets, releases, images or deployments.
import {spawnSync} from "node:child_process";
import {
  requirePatchedGhVersion,requireStagingGovernance
} from "../lib/release-governance-policy.mjs";

function gh(args){
  const result=spawnSync("gh",args,{
    env:process.env,encoding:"utf8",timeout:20000,maxBuffer:512*1024
  });
  if(result.error||result.status!==0)throw new Error("GITHUB_READ_FAILED");
  return result.stdout;
}
try{
  if(!process.env.GH_TOKEN)throw new Error("GITHUB_TOKEN_REQUIRED");
  const repo=process.env.GITHUB_REPOSITORY;
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??""))
    throw new Error("GITHUB_REPOSITORY_INVALID");
  if(process.env.GITHUB_REF!=="refs/heads/main")
    throw new Error("MAIN_BRANCH_ONLY");
  requirePatchedGhVersion(gh(["version"]));
  const read=endpoint=>{
    try{return JSON.parse(gh(["api","--method","GET",endpoint]));}
    catch{throw new Error("GITHUB_GOVERNANCE_READ_FAILED");}
  };
  const result=requireStagingGovernance({
    environment:read("repos/"+repo+"/environments/staging"),
    branch:read("repos/"+repo+"/branches/main"),
    rules:read("repos/"+repo+"/rules/branches/main")
  });
  console.log("GOVERNANCE_PREFLIGHT_PASSED: live GitHub staging protections, main review and required checks present.");
  // No unchecked data from GitHub is used to assert that MFA or signature exists.
  if(process.env.GITHUB_OUTPUT){
    const {appendFileSync}=await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT,"governance_passed=true\n");
  }
}catch(error){
  console.error("RELEASE_BLOCKED: "+
    (error instanceof Error?error.message:"STAGING_GOVERNANCE_UNAVAILABLE"));
  process.exitCode=1;
}
