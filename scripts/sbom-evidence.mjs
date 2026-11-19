// Validate CI-generated CycloneDX for the built local container.
// This intentionally records UNSIGNED evidence; it is not a Sigstore attestation.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile,writeFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const MAX_SBOM_BYTES=25*1024*1024;
const SHA256=/^[a-f0-9]{64}$/;

export function verifySbomDocument(document){
  assert.ok(document && typeof document==="object" && !Array.isArray(document),
    "SBOM must be an object");
  assert.equal(document.bomFormat,"CycloneDX","Unexpected SBOM format");
  assert.match(document.specVersion??"",/^1\.[4-9]$/,"Unknown CycloneDX version");
  assert.ok(Array.isArray(document.components) && document.components.length>0,
    "SBOM missing discovered package components");
  for(const item of document.components){
    assert.ok(item && typeof item==="object","Invalid SBOM component");
    assert.ok(typeof item.name==="string" && item.name.trim().length>0,
      "SBOM component missing name");
    assert.ok(typeof item.type==="string" && item.type.length>0,
      "SBOM component missing type");
  }
  return {
    specVersion:document.specVersion,
    componentCount:document.components.length,
    libraryCount:document.components.filter(c=>c.type==="library").length,
    operatingSystemCount:document.components.filter(c=>c.type==="operating-system").length
  };
}

export function makeUnsignedEvidence({sbomBytes,document,imageId,repository,commit,runId}){
  assert.ok(sbomBytes instanceof Uint8Array);
  assert.match(imageId??"",/^sha256:[a-f0-9]{64}$/);
  assert.match(commit??"",/^[a-f0-9]{40}$/);
  assert.match(repository??"",/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.match(runId??"",/^\d+$/);
  const details=verifySbomDocument(document);
  return {
    schemaVersion:1,
    evidenceType:"unsigned-ci-sbom",
    signatureStatus:"not-signed",
    sourceRepository:repository,
    sourceCommit:commit,
    githubActionsRunId:runId,
    imageTag:"km2026-staging:ci",
    imageId,
    imageIdMeaning:"Local Docker image ID, not a registry manifest digest",
    sbomFile:"km2026-image.cdx.json",
    sbomSha256:createHash("sha256").update(sbomBytes).digest("hex"),
    sbomFormat:"CycloneDX",
    ...details,
    limitation:"CI-generated, unsigned build evidence. No Sigstore signature or pushed image attestation."
  };
}
async function main(){
  const sourceFile=process.argv[2];
  if(!sourceFile)throw new Error("Provide the CycloneDX JSON input path");
  const sourceStat=await stat(sourceFile);
  if(sourceStat.size<=0||sourceStat.size>MAX_SBOM_BYTES)
    throw new Error("Invalid SBOM size");
  const raw=await readFile(sourceFile);
  const doc=JSON.parse(raw.toString("utf8"));
  const imageId=execFileSync("docker",[
    "image","inspect","--format","{{.Id}}","km2026-staging:ci"
  ],{encoding:"utf8",timeout:10000}).trim();
  const evidence=makeUnsignedEvidence({
    sbomBytes:raw,document:doc,imageId,
    repository:process.env.GITHUB_REPOSITORY,
    commit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID
  });
  await writeFile(path.join(path.dirname(sourceFile),"km2026-build-evidence.json"),
    JSON.stringify(evidence,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("Validated CycloneDX SBOM with "+evidence.componentCount+
    " packages, SHA-256 "+evidence.sbomSha256+
    " and local image ID "+imageId+"; evidence is NOT SIGNED.");
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error("SBOM evidence check failed:",error.message);
    process.exitCode=1;
  });
}
