import assert from "node:assert/strict";
import test from "node:test";
import {
 releasePolicy,requireVerifiedStatement,
 PROVENANCE_PREDICATE,CYCLONEDX_PREDICATE
} from "../lib/release-attestation-policy.mjs";
const repo="sample-org/Example_Repo";
const imageName="ghcr.io/sample-org/example_repo";
const digest="f".repeat(64);
const sha="e".repeat(40);
const policy=releasePolicy({
 repository:repo,imageRef:imageName+"@sha256:"+digest,
 sourceSha:sha,githubRef:"refs/heads/main"
});
function simulatedCliOutput(predicateType=PROVENANCE_PREDICATE,overrides={}){
 // Synthetic JSON ONLY tests the parser; it is NOT a cryptographic signature.
 return JSON.stringify([{
  verificationResult:{
   signature:{certificate:{subject:"synthetic-unit-test"}},
   statement:{
    predicateType,subject:[{name:imageName,digest:{sha256:digest}}],
    ...overrides
   }
  }
 }]);
}
test("requires exact GHCR digest, main ref and source SHA",()=>{
 assert.equal(policy.signerWorkflow,repo+"/.github/workflows/ci.yml");
 assert.equal(policy.manifestSha256,digest);
 for(const patch of [
  {githubRef:"refs/heads/feature"},
  {imageRef:imageName+":latest"},
  {imageRef:"ghcr.io/other/image@sha256:"+digest},
  {imageRef:imageName+"@sha256:"+"x".repeat(64)},
  {sourceSha:"main"}
 ]){
  assert.throws(()=>releasePolicy({
   repository:repo,imageRef:imageName+"@sha256:"+digest,
   sourceSha:sha,githubRef:"refs/heads/main",...patch
  }));
 }
});
test("SLSA and CycloneDX statements must target same manifest",()=>{
 assert.equal(requireVerifiedStatement(
  simulatedCliOutput(PROVENANCE_PREDICATE),policy,PROVENANCE_PREDICATE),true);
 assert.equal(requireVerifiedStatement(
  simulatedCliOutput(CYCLONEDX_PREDICATE),policy,CYCLONEDX_PREDICATE),true);
 assert.throws(()=>requireVerifiedStatement(
  simulatedCliOutput(PROVENANCE_PREDICATE),policy,CYCLONEDX_PREDICATE));
});
test("reject empty, unsigned, changed digest and changed subject",()=>{
 for(const raw of ["[]","false","{}","invalid"])
  assert.throws(()=>requireVerifiedStatement(raw,policy,PROVENANCE_PREDICATE));
 assert.throws(()=>requireVerifiedStatement(JSON.stringify([{
  verificationResult:{statement:{
   predicateType:PROVENANCE_PREDICATE,
   subject:[{name:imageName,digest:{sha256:digest}}]
  }}
 }]),policy,PROVENANCE_PREDICATE));
 assert.throws(()=>requireVerifiedStatement(simulatedCliOutput(
  PROVENANCE_PREDICATE,{subject:[{name:imageName,digest:{sha256:"a".repeat(64)}}]}
 ),policy,PROVENANCE_PREDICATE));
 assert.throws(()=>requireVerifiedStatement(simulatedCliOutput(
  PROVENANCE_PREDICATE,{subject:[{name:"ghcr.io/attacker/other",digest:{sha256:digest}}]}
 ),policy,PROVENANCE_PREDICATE));
});
