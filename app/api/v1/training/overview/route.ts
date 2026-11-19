import { NextRequest, NextResponse } from "next/server";
import { getDatabasePool, isDatabaseConfigured } from "@/lib/server/db";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";
import { getTrainingLearner, trainingExamEnabled, trainingRegistrationEnabled } from "@/lib/server/training-security";
import { APPROVED_BANK_SIZE } from "@/lib/training-exam";
import { publicSurveyLanding } from "@/lib/server/training-surveys";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Lesson={number:number;title:string|null;url:string|null;published:boolean};

export async function GET(request:NextRequest){
  const empty:Lesson[]=Array.from({length:9},(_,i)=>({
    number:i+1,title:null,url:null,published:false
  }));
  const notice=process.env.TRAINING_PRIVACY_NOTICE_URL??null;
  const url=notice&&notice.startsWith("https://")?notice:null;
  if(!isDatabaseConfigured())return NextResponse.json({
    lessons:empty,registrationOpen:false,examOpen:false,
    privacyNoticeUrl:url,bankReady:false,surveysVerified:[],
    registered:false,surveyLaunchAvailable:{"1":false,"9":false}
  },{headers:{"Cache-Control":"no-store"}});
  try{
    const [rows,bank,learner]=await Promise.all([
      getDatabasePool().query(
        "SELECT lesson_number,title,approved_material_url,status FROM training_lessons ORDER BY lesson_number"
      ),
      getDatabasePool().query(
        "SELECT COUNT(*)::integer AS count FROM training_questions WHERE approval_status='approved'"
      ),
      getTrainingLearner(request)
    ]);
    const lookup=new Map(rows.rows.map(r=>[r.lesson_number,r]));
    const lessons=empty.map(item=>{
      const row=lookup.get(item.number);
      if(!row||row.status!=="published")return item;
      const safe=safeOfficialDriveUrl(row.approved_material_url);
      return safe?{
        number:item.number,published:true,title:row.title,url:safe
      }:item;
    });
    let surveys:number[]=[];
    if(learner){
      const result=await getDatabasePool().query([
        "SELECT v.lesson_number FROM training_verified_surveys v",
        "JOIN training_survey_handoffs h ON h.id=v.handoff_id",
        "WHERE v.learner_id=$1 AND h.consumed_at IS NOT NULL"
      ].join(" "),[learner.id]);
      surveys=result.rows.map(x=>Number(x.lesson_number));
    }
    const bankReady=bank.rows[0]?.count===APPROVED_BANK_SIZE;
    const materialReady=lessons.every(x=>x.published);
    const eligible=surveys.includes(1)&&surveys.includes(9);
    const surveyLaunchAvailable={
      "1":lessons[0].published && Boolean(publicSurveyLanding(1)),
      "9":lessons[8].published && Boolean(publicSurveyLanding(9))
    };
    return NextResponse.json({
      lessons,registrationOpen:trainingRegistrationEnabled(),
      examOpen:trainingExamEnabled()&&bankReady&&materialReady&&eligible,
      bankReady,privacyNoticeUrl:url,surveysVerified:surveys,
      registered:Boolean(learner),surveyLaunchAvailable
    },{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"TRAINING_UNAVAILABLE"},{status:503});}
}
