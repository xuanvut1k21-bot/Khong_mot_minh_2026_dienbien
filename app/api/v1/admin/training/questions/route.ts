import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin,validateAdminWriteOrigin,
 parseJsonBody,errorResponse } from "@/lib/server/activity-editorial";
import { getDatabasePool } from "@/lib/server/db";
import { mustTrainingPermission,trainingPermitted,
 questionContent,recordTrainingEvent } from "@/lib/server/training-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const filter=z.object({
 status:z.enum(["all","draft","pending","approved","archived"]).default("all"),
 page:z.coerce.number().int().min(1).max(10000).default(1)
});
export async function GET(request:NextRequest){
 const actor=await authenticateAdmin(request);
 if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
 const input=filter.safeParse({
  status:request.nextUrl.searchParams.get("status")??"all",
  page:request.nextUrl.searchParams.get("page")??"1"
 });
 if(!input.success)return NextResponse.json({error:"INVALID_FILTER"},{status:400});
 const db=await getDatabasePool().connect();
 try{
  await mustTrainingPermission(db,actor.id,"training_questions","view");
  const [rows,canEdit,canApprove,count]=await Promise.all([
   db.query([
    "SELECT id,question_text,option_a,option_b,option_c,option_d,",
    "correct_index,source_reference,created_by,approval_status,approved_by,updated_at",
    "FROM training_questions",
    "WHERE ($1::text='all' OR approval_status=$1)",
    "ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET $2"
   ].join(" "),[input.data.status,(input.data.page-1)*20]),
   trainingPermitted(db,actor.id,"training_questions","edit"),
   trainingPermitted(db,actor.id,"training_questions","approve"),
   db.query([
    "SELECT approval_status,COUNT(*)::integer AS count FROM training_questions",
    "GROUP BY approval_status"
   ].join(" "))
  ]);
  return NextResponse.json({
   page:input.data.page,
   hasMore:rows.rows.length>20,
   stats:Object.fromEntries(count.rows.map(r=>[r.approval_status,Number(r.count)])),
   canEdit,canApprove,
   items:rows.rows.slice(0,20).map(r=>({
    id:r.id,text:r.question_text,
    options:[r.option_a,r.option_b,r.option_c,r.option_d],
    correctIndex:r.correct_index,sourceUrl:r.source_reference??"",
    status:r.approval_status,
    authoredBySelf:r.created_by===actor.id,
    updatedAt:r.updated_at
   }))
  },{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return errorResponse(e);}
 finally{db.release();}
}

export async function POST(request:NextRequest){
 if(!validateAdminWriteOrigin(request))
  return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const actor=await authenticateAdmin(request);
 if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
 const body=await parseJsonBody(request,questionContent);
 if(!body)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 const url=safeOfficialDriveUrl(body.sourceUrl);
 if(!url)return NextResponse.json({error:"INVALID_SOURCE_DRIVE_URL"},{status:400});
 const db=await getDatabasePool().connect();
 try{
  await db.query("BEGIN");
  await mustTrainingPermission(db,actor.id,"training_questions","edit");
  const saved=await db.query([
   "INSERT INTO training_questions(question_text,option_a,option_b,option_c,",
   "option_d,correct_index,source_reference,created_by,approval_status)",
   "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id"
  ].join(" "),[body.text,...body.options,body.correctIndex,url,actor.id]);
  const id=saved.rows[0].id;
  await recordTrainingEvent(db,actor.id,"question",id,"create",null,"draft");
  await db.query("COMMIT");
  return NextResponse.json({id,status:"draft"},{
   status:201,headers:{"Cache-Control":"private, no-store"}
  });
 }catch(e){await db.query("ROLLBACK");return errorResponse(e);}
 finally{db.release();}
}
