import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_BANK_SIZE,EXAM_QUESTION_COUNT,EXAM_PASS_COUNT,
  EXAM_DURATION_SECONDS,gradeExam
} from "../lib/training-exam";

const keys=Array.from({length:20},(_,i)=>({
  position:i+1,correctIndex:(i%4)+1
}));
test("exam policy constants",()=>{
  assert.equal(APPROVED_BANK_SIZE,90);
  assert.equal(EXAM_QUESTION_COUNT,20);
  assert.equal(EXAM_PASS_COUNT,16);
  assert.equal(EXAM_DURATION_SECONDS,900);
});
test("exactly 16 correct passes",()=>{
  const submitted=keys.slice(0,16).map(x=>({
    position:x.position,choiceIndex:x.correctIndex
  }));
  assert.deepEqual(gradeExam(keys,submitted),{correct:16,passed:true});
});
test("15 correct does not pass and can be retried",()=>{
  const answers=keys.slice(0,15).map(x=>({
    position:x.position,choiceIndex:x.correctIndex
  }));
  assert.deepEqual(gradeExam(keys,answers),{correct:15,passed:false});
  assert.deepEqual(gradeExam(keys,[]),{correct:0,passed:false});
});
test("reject duplicate answers and impossible options",()=>{
  assert.throws(()=>gradeExam(keys,[{position:1,choiceIndex:1},{position:1,choiceIndex:2}]));
  assert.throws(()=>gradeExam(keys,[{position:1,choiceIndex:5}]));
  assert.throws(()=>gradeExam(keys,[{position:21,choiceIndex:1}]));
  assert.throws(()=>gradeExam(keys.slice(0,19),[]));
});
