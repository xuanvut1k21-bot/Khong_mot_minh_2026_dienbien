import { NextResponse } from "next/server";
import { getDatabasePool, isDatabaseConfigured } from "@/lib/server/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  if(!isDatabaseConfigured())return NextResponse.json(
    {status:"unavailable"},{
      status:503,headers:{"Cache-Control":"no-store"}
    });
  try{
    const result=await getDatabasePool().query({
      text:[
        "SELECT to_regclass('public.activities') IS NOT NULL AS activities,",
        "to_regclass('public.admin_users') IS NOT NULL AS auth,",
        "to_regclass('public.training_learners') IS NOT NULL AS training,",
        "to_regclass('public.training_learner_rate_limits') IS NOT NULL AS throttles"
      ].join(" "),query_timeout:3000
    });
    if(result.rowCount===1 &&
      Object.values(result.rows[0]).every(x=>x===true)){
      return NextResponse.json({status:"ready"},{
        headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
      });
    }
  }catch{/* Fail closed. Never reveal schema, host or credentials. */}
  return NextResponse.json({status:"unavailable"},{
    status:503,headers:{"Cache-Control":"no-store"}
  });
}
