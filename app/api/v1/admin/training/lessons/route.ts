import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin,errorResponse } from "@/lib/server/activity-editorial";
import { getDatabasePool } from "@/lib/server/db";
import { trainingPermitted } from "@/lib/server/training-editorial";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const actor=await authenticateAdmin(request);
  if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  const db=await getDatabasePool().connect();
  try{
    if(!await trainingPermitted(db,actor.id,"training_lessons","view"))
      return NextResponse.json({error:"FORBIDDEN"},{status:403});
    const [rows,canEdit,canApprove]=await Promise.all([
      db.query([
        "SELECT lesson_number,title,approved_material_url,status,editor_id,",
        "approved_by,updated_at,published_at FROM training_lessons",
        "ORDER BY lesson_number"
      ].join(" ")),
      trainingPermitted(db,actor.id,"training_lessons","edit"),
      trainingPermitted(db,actor.id,"training_lessons","approve")
    ]);
    return NextResponse.json({
      items:rows.rows.map(r=>({
        number:r.lesson_number,title:r.title??"",materialUrl:r.approved_material_url??"",
        status:r.status,editorId:r.editor_id,
        isEditor:r.editor_id===actor.id,publishedAt:r.published_at,
        updatedAt:r.updated_at
      })),
      canEdit,canApprove
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
  finally{db.release();}
}
