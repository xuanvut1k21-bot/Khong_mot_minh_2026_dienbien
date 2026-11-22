import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/server/activity-editorial";
import { getMediaStorageConfig, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/server/media-storage";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest) {
  const actor=await authenticateAdmin(request);
  if(!actor)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  let enabled=false;
  try{getMediaStorageConfig();enabled=true;}catch{}
  return NextResponse.json({
    enabled,maxBytes:MAX_IMAGE_UPLOAD_BYTES,
    acceptedMimes:["image/jpeg","image/png","image/webp"],
    warning:"Chỉ xử lý ảnh; tệp phải qua kiểm tra và kiểm duyệt trước khi công bố."
  },{headers:{"Cache-Control":"no-store"}});
}
