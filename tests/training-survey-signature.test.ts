import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  randomTrainingToken,tokenDigest,verifySurveySignature
} from "../lib/server/training-security";

test("training survey correlation token is opaque and strong",()=>{
  const token=randomTrainingToken();
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  assert.match(tokenDigest(token),/^[a-f0-9]{64}$/);
  assert.notEqual(token,randomTrainingToken());
  assert.equal(tokenDigest(token),tokenDigest(token));
});
test("survey HMAC validates exact body and recent timestamp",()=>{
  const previousFlag=process.env.TRAINING_SURVEY_WEBHOOK_ENABLED;
  const previousSecret=process.env.TRAINING_SURVEY_WEBHOOK_SECRET;
  process.env.TRAINING_SURVEY_WEBHOOK_ENABLED="true";
  process.env.TRAINING_SURVEY_WEBHOOK_SECRET="0123456789ABCDEF0123456789ABCDEF";
  try{
    const now=Math.floor(Date.now()/1000).toString();
    const body=JSON.stringify({submissionVerified:true,lessonNumber:1});
    const signed=createHmac("sha256",process.env.TRAINING_SURVEY_WEBHOOK_SECRET)
      .update(now+"."+body).digest("hex");
    assert.equal(verifySurveySignature(now,body,signed),true);
    assert.equal(verifySurveySignature(now,body+" ",signed),false);
    assert.equal(verifySurveySignature((Number(now)-600).toString(),body,signed),false);
    assert.equal(verifySurveySignature(now,body,signed.replace(/^./,signed[0]==="a"?"b":"a")),false);
  }finally{
    if(previousFlag===undefined)delete process.env.TRAINING_SURVEY_WEBHOOK_ENABLED;
    else process.env.TRAINING_SURVEY_WEBHOOK_ENABLED=previousFlag;
    if(previousSecret===undefined)delete process.env.TRAINING_SURVEY_WEBHOOK_SECRET;
    else process.env.TRAINING_SURVEY_WEBHOOK_SECRET=previousSecret;
  }
});
