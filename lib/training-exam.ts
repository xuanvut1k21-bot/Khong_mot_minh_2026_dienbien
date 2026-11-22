export const EXAM_QUESTION_COUNT=20;
export const EXAM_PASS_COUNT=16;
export const EXAM_DURATION_SECONDS=15*60;
export const APPROVED_BANK_SIZE=90;

export type Answer={position:number;choiceIndex:number};
export function gradeExam(
  correctItems:readonly {position:number;correctIndex:number}[],
  submitted:readonly Answer[]
):{correct:number;passed:boolean}{
  if(correctItems.length!==EXAM_QUESTION_COUNT)
    throw new Error("INVALID_QUESTION_COUNT");
  const answerMap=new Map<number,number>();
  for(const item of submitted){
    if(!Number.isInteger(item.position)||item.position<1||item.position>20||
       !Number.isInteger(item.choiceIndex)||item.choiceIndex<1||item.choiceIndex>4||
       answerMap.has(item.position)) throw new Error("INVALID_ANSWERS");
    answerMap.set(item.position,item.choiceIndex);
  }
  let correct=0;
  for(const item of correctItems){
    if(answerMap.get(item.position)===item.correctIndex)correct++;
  }
  return {correct,passed:correct>=EXAM_PASS_COUNT};
}
