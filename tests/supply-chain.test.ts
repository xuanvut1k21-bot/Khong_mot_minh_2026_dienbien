import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const docker=readFileSync("Dockerfile","utf8");
const ci=readFileSync(".github/workflows/ci.yml","utf8");
const staging=readFileSync(".github/workflows/staging-readiness.yml","utf8");
const attestationGate=readFileSync(".github/workflows/verify-staging-attestation.yml","utf8");
const sha=/^sha256:[0-9a-f]{64}$/;

test("builder and minimal runtime use separate immutable OCI digests",()=>{
 const stages=[...docker.matchAll(/^FROM (\S+) AS (\w+)$/gm)];
 assert.deepEqual(stages.map(m=>m[2]),["deps","builder","runtime"]);
 const [deps,builder,runtime]=stages.map(m=>m[1]);
 assert.equal(deps,builder);
 assert.equal(deps.split("@")[0],"node:22-bookworm-slim");
 assert.match(deps.split("@")[1]??"",sha);
 assert.equal(runtime.split("@")[0],"gcr.io/distroless/nodejs22-debian13:nonroot");
 assert.match(runtime.split("@")[1]??"",sha);
 assert.notEqual(runtime,deps);
 assert.match(docker,/USER 65532:65532/);
 assert.match(docker,/CMD \["server.js"\]/);
});

test("GitHub workflow actions use complete reviewed 40-character commit SHA",()=>{
 for(const [path,workflow] of [["ci",ci],["staging",staging],["attestationGate",attestationGate]] as const){
   const used=[...workflow.matchAll(/uses:\s*([^\s#]+)\s*(?:#.*)?$/gm)]
     .map(match=>match[1]);
   assert.ok(used.length>=2,path+" missing expected actions");
   for(const action of used){
     const parts=action.split("@");
     assert.equal(parts.length,2,path+" invalid action reference");
     assert.match(parts[1],/^[a-f0-9]{40}$/,path+" action not SHA pinned: "+parts[0]);
   }
 }
 assert.match(ci,/aquasecurity\/trivy-action@[a-f0-9]{40}/);
 assert.match(ci,/vuln-type: os/);
 assert.match(ci,/severity: HIGH,CRITICAL/);
 assert.match(ci,/exit-code: "1"/);
 assert.match(ci,/format: cyclonedx/);
 assert.match(ci,/scripts\/sbom-evidence\.mjs/);
 assert.match(ci,/actions\/upload-artifact@[a-f0-9]{40}/);
});

test("release image attestation verification is manual and cannot deploy",()=>{
 assert.match(attestationGate,/workflow_dispatch:/);
 assert.match(attestationGate,/environment: staging/);
 assert.match(attestationGate,/github\.ref == 'refs\/heads\/main'/);
 assert.match(attestationGate,/scripts\/verify-release-attestation\.mjs/);
 assert.match(attestationGate,/attestations: read/);
 assert.doesNotMatch(attestationGate,/attestations: write/);
 assert.doesNotMatch(attestationGate,/(docker push|kubectl|helm upgrade|ssh\s|deployments: write)/);
});
