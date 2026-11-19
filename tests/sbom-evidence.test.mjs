import assert from "node:assert/strict";
import test from "node:test";
import {verifySbomDocument,makeUnsignedEvidence} from "../scripts/sbom-evidence.mjs";
const valid={
 bomFormat:"CycloneDX",specVersion:"1.6",
 components:[
  {type:"library",name:"synthetic-npm-package",version:"1.0.0"},
  {type:"operating-system",name:"synthetic-OS",version:"1"}
 ]
};
const args={
 sbomBytes:new TextEncoder().encode(JSON.stringify(valid)),
 document:valid,
 imageId:"sha256:"+"a".repeat(64),
 repository:"example/ci",
 commit:"b".repeat(40),
 runId:"12345"
};
test("CycloneDX package inventory validated",()=>{
 const result=verifySbomDocument(valid);
 assert.equal(result.componentCount,2);
 assert.equal(result.specVersion,"1.6");
});
test("reject missing inventory or wrong SBOM schema",()=>{
 assert.throws(()=>verifySbomDocument({...valid,components:[]}));
 assert.throws(()=>verifySbomDocument({...valid,bomFormat:"SPDX"}));
 assert.throws(()=>verifySbomDocument({...valid,components:[{name:"no-type"}]}));
});
test("CI evidence is explicitly unsigned and matches input SHA",()=>{
 const evidence=makeUnsignedEvidence(args);
 assert.equal(evidence.signatureStatus,"not-signed");
 assert.match(evidence.sbomSha256,/^[0-9a-f]{64}$/);
 assert.equal(evidence.sourceCommit,"b".repeat(40));
 assert.equal(evidence.imageIdMeaning.includes("not a registry manifest"),true);
});
test("reject malformed build identity and arbitrary image references",()=>{
 assert.throws(()=>makeUnsignedEvidence({...args,commit:"main"}));
 assert.throws(()=>makeUnsignedEvidence({...args,imageId:"node:latest"}));
});
