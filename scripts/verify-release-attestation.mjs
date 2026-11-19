// Manual verification ONLY; no deployment, signing, Docker push or fake signatures.
// A zero exit from gh attestation verify alone is insufficient: SLSA and SBOM
// attestations must both target the identical registry manifest digest.
import {spawnSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {
  releasePolicy, requireVerifiedStatement,
  PROVENANCE_PREDICATE, CYCLONEDX_PREDICATE
} from "../lib/release-attestation-policy.mjs";

function githubVerify(policy,predicateType){
  const args=[
    "attestation","verify","oci://"+policy.imageRef,
    "--repo",policy.repository,
    "--signer-workflow",policy.signerWorkflow,
    "--source-digest",policy.sourceSha,
    "--source-ref",policy.sourceRef,
    "--cert-oidc-issuer","https://token.actions.githubusercontent.com",
    "--deny-self-hosted-runners",
    "--predicate-type",predicateType,
    "--format","json"
  ];
  const response=spawnSync("gh",args,{
    encoding:"utf8",timeout:90000,maxBuffer:4*1024*1024,
    env:process.env
  });
  if(response.error||response.status!==0)
    throw new Error("CRYPTOGRAPHIC_ATTESTATION_VERIFICATION_FAILED");
  requireVerifiedStatement(response.stdout,policy,predicateType);
}

try{
  if(!process.env.GH_TOKEN)throw new Error("GITHUB_CREDENTIALS_MISSING");
  const policy=releasePolicy({
    repository:process.env.GITHUB_REPOSITORY,
    imageRef:process.env.RELEASE_IMAGE_REF,
    sourceSha:process.env.RELEASE_SOURCE_SHA,
    githubRef:process.env.GITHUB_REF
  });
  githubVerify(policy,PROVENANCE_PREDICATE);
  githubVerify(policy,CYCLONEDX_PREDICATE);

  const summary=[
    "### Release attestation check: VERIFIED",
    "",
    "- Registry manifest: "+policy.imageRef,
    "- Source repository: "+policy.repository,
    "- Source commit: "+policy.sourceSha,
    "- Signed workflow: "+policy.signerWorkflow,
    "- SLSA build provenance: cryptographically verified",
    "- CycloneDX SBOM attestation: cryptographically verified",
    "- NO deployment was performed."
  ].join("\n")+"\n";
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log("RELEASE_ATTESTATIONS_VERIFIED: two signed predicates, matching image digest and trusted source.");
}catch(error){
  const key=error instanceof Error?error.message:"RELEASE_VERIFICATION_FAILED";
  console.error("RELEASE_BLOCKED: "+key);
  process.exitCode=1;
}
