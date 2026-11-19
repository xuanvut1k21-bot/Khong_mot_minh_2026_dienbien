import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin,validateAdminWriteOrigin,parseJsonBody,
 errorResponse,EditorialError } from "@/lib/server/activity-editorial";
import { getDatabasePool } from "@/lib/server/db";
import { lessonContent,mustTrainingPermission,recordTrainingEvent
} from "@/lib/server/training-editorial";
import { safeOfficialDriveUrl } from "@/lib/server/public-content";

export const runtime="nodejs";
type Context={params:Promise<{number:string}>};
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),content:lessonContent}).strict(),
  z.object({action:z.enum(["submit","return","publish","withdraw"])}).strict()
]);
export async function POST(request:NextRequest,ctx:Context){
  if(!validateAdminWriteOrigin(request))
    return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
  const actor=await authenticateAdmin(request);
  if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const {number}=await ctx.params;
  if(!/^[1-9]$/.test(number))
    return NextResponse.json({error:"INVALID_LESSON"},{status:400});
  const data=await parseJsonBody(request,schema);
  if(!data)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const found=await db.query([
      "SELECT lesson_number,title,approved_material_url,status,editor_id",
      "FROM training_lessons WHERE lesson_number=$1 FOR UPDATE"
    ].join(" "),[Number(number)]);
    if(found.rowCount!==1)throw new EditorialError(404,"LESSON_NOT_FOUND");
    const lesson=found.rows[0],before:string=lesson.status;
    const review=["return","publish","withdraw"].includes(data.action);
    await mustTrainingPermission(db,actor.id,"training_lessons",review?"approve":"edit");
    let after:string;
    if(data.action==="save"){
      if(before!=="draft")throw new EditorialError(409,"NOT_EDITABLE");
      const url=safeOfficialDriveUrl(data.content.materialUrl);
      if(!url)throw new EditorialError(400,"INVALID_SOURCE_DRIVE_URL");
      await db.query([
        "UPDATE training_lessons SET title=$2,approved_material_url=$3,editor_id=$4,",
        "approved_by=NULL,published_at=NULL,updated_at=NOW()",
        "WHERE lesson_number=$1"
      ].join(" "),[Number(number),data.content.title,url,actor.id]);
      after="draft";
    }else if(data.action==="submit"){
      if(before!=="draft"||!lesson.editor_id||
         !lesson.title||!safeOfficialDriveUrl(lesson.approved_material_url))
        throw new EditorialError(409,"INCOMPLETE_LESSON");
      await db.query(
        "UPDATE training_lessons SET status='pending',updated_at=NOW() WHERE lesson_number=$1",
        [Number(number)]
      );
      after="pending";
    }else if(data.action==="return"){
      if(before!=="pending")throw new EditorialError(409,"NOT_PENDING");
      await db.query([
        "UPDATE training_lessons SET status='draft',approved_by=NULL,",
        "published_at=NULL,updated_at=NOW() WHERE lesson_number=$1"
      ].join(" "),[Number(number)]);
      after="draft";
    }else if(data.action==="publish"){
      if(before!=="pending"||lesson.editor_id===actor.id||
         !lesson.editor_id||!safeOfficialDriveUrl(lesson.approved_material_url))
        throw new EditorialError(409,"SEPARATION_OR_STATUS_INVALID");
      await db.query([
        "UPDATE training_lessons SET status='published',approved_by=$2,",
        "published_at=NOW(),updated_at=NOW() WHERE lesson_number=$1"
      ].join(" "),[Number(number),actor.id]);
      after="published";
    }else{
      if(before!=="published")throw new EditorialError(409,"NOT_PUBLISHED");
      await db.query([
        "UPDATE training_lessons SET status='draft',approved_by=NULL,",
        "published_at=NULL,updated_at=NOW() WHERE lesson_number=$1"
      ].join(" "),[Number(number)]);
      after="draft";
    }
    await recordTrainingEvent(db,actor.id,"lesson",number,data.action,before,after);
    await db.query("COMMIT");
    return NextResponse.json({success:true,status:after},{
      headers:{"Cache-Control":"private, no-store"}
    });
  }catch(e){await db.query("ROLLBACK");return errorResponse(e);}
  finally{db.release();}
}
