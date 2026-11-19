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
    pdfEnabled:enabled && process.env.MEDIA_PDF_PREVIEW_ENABLED==="true",
    videoEnabled:enabled && process.env.MEDIA_VIDEO_POSTER_ENABLED==="true",
    acceptedMimes:["image/jpeg","image/png","image/webp"],
    warning:"PDF/video chỉ có ảnh bìa xem trước; không phát hoặc tải tệp gốc."
  },{headers:{"Cache-Control":"no-store"}});
}
