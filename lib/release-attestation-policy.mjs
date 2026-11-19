// This is a release policy; cryptographic verification is done by GitHub CLI.
export const PROVENANCE_PREDICATE="https://slsa.dev/provenance/v1";
export const CYCLONEDX_PREDICATE="https://cyclonedx.org/bom";
const SHA256=/^[a-f0-9]{64}$/;
const SHA40=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function releasePolicy({repository,imageRef,sourceSha,githubRef}){
  if(!REPO.test(repository??""))throw new Error("REPOSITORY_INVALID");
  if(githubRef!=="refs/heads/main")throw new Error("MAIN_BRANCH_ONLY");
  if(!SHA40.test(sourceSha??""))throw new Error("SOURCE_COMMIT_INVALID");
  const expectedName="ghcr.io/"+repository.toLowerCase();
  if(typeof imageRef!=="string"||!imageRef.startsWith(expectedName+"@sha256:"))
    throw new Error("UNEXPECTED_IMAGE_REPOSITORY");
  const [name,digest,...extra]=imageRef.split("@");
  if(name!==expectedName||extra.length||!digest?.startsWith("sha256:")||
     !SHA256.test(digest.slice(7)))throw new Error("IMAGE_DIGEST_REQUIRED");
  return {
    repository,sourceSha,sourceRef:"refs/heads/main",
    imageRef,imageName:name,manifestSha256:digest.slice(7),
    signerWorkflow:repository+"/.github/workflows/ci.yml"
  };
}

// Only feed the JSON returned by a successful gh attestation verify process.
// The CLI enforces GitHub OIDC identity, signing workflow, branch, SHA and
// predicate type and performs the cryptographic verification before returning.
export function requireVerifiedStatement(jsonText,policy,predicateType){
  if(![PROVENANCE_PREDICATE,CYCLONEDX_PREDICATE].includes(predicateType))
    throw new Error("PREDICATE_UNSUPPORTED");
  let reports;
  try{reports=JSON.parse(jsonText);}
  catch{throw new Error("VERIFY_OUTPUT_INVALID_JSON");}
  if(!Array.isArray(reports)||reports.length===0)
    throw new Error("NO_VERIFIED_ATTESTATION");
  const match=reports.some(result=>{
    const verification=result?.verificationResult;
    const statement=verification?.statement;
    if(!verification?.signature?.certificate||!statement||
       statement.predicateType!==predicateType||!Array.isArray(statement.subject))
      return false;
    return statement.subject.some(subject=>
      subject&&[policy.imageName,"oci://"+policy.imageName].includes(subject.name)&&
      subject.digest?.sha256===policy.manifestSha256
    );
  });
  if(!match)throw new Error("VERIFIED_SUBJECT_MISMATCH");
  return true;
}
