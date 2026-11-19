import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { getDatabasePool } from "@/lib/server/db";
import { publicSurveyLanding,surveyLesson } from "@/lib/server/training-surveys";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{number:string}>};
export async function GET(_request:NextRequest,ctx:Context){
  const number=surveyLesson((await ctx.params).number);
  if(!number)return new Response("Not found",{status:404});
  const landing=publicSurveyLanding(number);
  if(!landing)return new Response("QR unavailable",{status:404});
  try{
    const approved=await getDatabasePool().query(
      "SELECT 1 FROM training_lessons WHERE lesson_number=$1 AND status='published'",
      [number]
    );
    if(!approved.rowCount)return new Response("Not found",{status:404});
    // Stable, printable QR. Contains NO learner ID or per-person token.
    const svg=await QRCode.toString(landing,{
      type:"svg",width:256,margin:2,errorCorrectionLevel:"M"
    });
    return new Response(svg,{headers:{
      "Content-Type":"image/svg+xml; charset=utf-8",
      "Cache-Control":"no-store",
      "Content-Security-Policy":"default-src 'none'; sandbox",
      "X-Content-Type-Options":"nosniff",
      "Cross-Origin-Resource-Policy":"same-origin",
      "Referrer-Policy":"no-referrer"
    }});
  }catch{
    return new Response("QR unavailable",{status:503,
      headers:{"Cache-Control":"no-store"}});
  }
}
