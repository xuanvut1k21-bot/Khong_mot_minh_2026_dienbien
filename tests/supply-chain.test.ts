import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const docker=readFileSync("Dockerfile","utf8");
const ci=readFileSync(".github/workflows/ci.yml","utf8");
const staging=readFileSync(".github/workflows/staging-readiness.yml","utf8");
const sha=/^sha256:[0-9a-f]{64}$/;

test("all three Node build stages share one immutable multiarch digest",()=>{
  const images=[...docker.matchAll(/^FROM (node:[^\s]+) AS (\w+)$/gm)];
  assert.deepEqual(images.map(m=>m[2]),["deps","builder","runtime"]);
  const refs=images.map(m=>m[1]);
  assert.equal(new Set(refs).size,1);
  assert.equal(refs[0].split("@")[0],"node:22-bookworm-slim");
  assert.match(refs[0].split("@")[1]??"",sha);
});

test("GitHub workflow actions use complete reviewed 40-character commit SHA",()=>{
 for(const [path,workflow] of [["ci",ci],["staging",staging]] as const){
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
});
