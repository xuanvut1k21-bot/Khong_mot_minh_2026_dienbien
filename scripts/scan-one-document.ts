// Single-job PDF/MP4 preview worker. Run in a restricted, network-isolated container.
// Requires: fresh ClamAV definitions, Poppler (pdfinfo/pdftoppm), ffprobe/ffmpeg, sharp.
// Publishes ONLY a static WebP cover into a private processed bucket; never the raw file.
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { getDatabasePool } from "../lib/server/db";
import {
  getMediaS3, getMediaStorageConfig, MAX_PDF_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES
} from "../lib/server/media-storage";

type Job = {
  id:string;asset_id:string;object_key:string;
  expected_size_bytes:string;expected_mime_type:"application/pdf"|"video/mp4";
  attempts:number;scan_token:string;
};
class Rejected extends Error {
  constructor(public readonly reason:string){super(reason);}
}
function maxSize(mime:Job["expected_mime_type"]):number{
  return mime==="application/pdf"?MAX_PDF_UPLOAD_BYTES:MAX_VIDEO_UPLOAD_BYTES;
}

async function runCommand(
  executable:string,args:string[],timeoutMs:number,outputLimit=32768
):Promise<string>{
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="",finished=false;
    const end=(error?:Error)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      if(error)reject(error);else resolve(stdout);
    };
    const timer=setTimeout(()=>{
      child.kill("SIGKILL");
      end(new Error("PROCESS_TIMEOUT"));
    },timeoutMs);
    child.on("error",()=>end(new Error("PROCESS_UNAVAILABLE")));
    child.stdout?.on("data",(chunk:Buffer)=>{
      stdout+=chunk.toString("utf8");
      if(stdout.length>outputLimit) {child.kill("SIGKILL");end(new Error("PROCESS_OUTPUT_LIMIT"));}
    });
    child.stderr?.on("data",(chunk:Buffer)=>{
      // Never echo untrusted source paths or embedded content in application logs.
      stderr+=chunk.toString("utf8");
      if(stderr.length>outputLimit) {child.kill("SIGKILL");end(new Error("PROCESS_OUTPUT_LIMIT"));}
    });
    child.on("close",code=>end(code===0?undefined:new Error("PROCESS_FAILED")));
  });
}

async function scanAntivirus(file:string):Promise<void>{
  try{
    await runCommand("clamscan",["--infected","--no-summary","--",file],120000);
  }catch(error){
    if(error instanceof Error && error.message==="PROCESS_FAILED"){
      // ClamAV uses code=1 for infection AND 2+ for scanner errors.
      // Never treat any nonzero code as clean; reject without publishing.
      throw new Rejected("ANTIVIRUS_REJECTED_OR_FAILED");
    }
    throw error;
  }
}

async function claimJob():Promise<Job|null>{
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const chosen=await db.query(
      [
        "WITH selected AS (SELECT id FROM media_upload_sessions",
        "WHERE expected_mime_type IN ('application/pdf','video/mp4')",
        "AND attempts<3 AND (",
        "(state='uploaded' AND expires_at<NOW()-INTERVAL '10 seconds')",
        "OR (state='scanning' AND lease_expires_at<NOW()))",
        "ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)",
        "UPDATE media_upload_sessions s SET state='scanning',attempts=s.attempts+1,",
        "scan_token=$1,lease_expires_at=NOW()+INTERVAL '10 minutes'",
        "FROM selected WHERE s.id=selected.id",
        "RETURNING s.id,s.asset_id,s.object_key,s.expected_size_bytes,",
        "s.expected_mime_type,s.attempts,s.scan_token"
      ].join(" "),[randomUUID()]
    );
    await db.query("COMMIT");
    return chosen.rows[0]??null;
  }catch(error){await db.query("ROLLBACK");throw error;}
  finally{db.release();}
}

async function renderPdfCover(file:string,folder:string):Promise<string>{
  const info=await runCommand("pdfinfo",["-isodates",file],15000);
  const match=info.match(/^Pages:\s*(\d+)\s*$/m);
  const pages=match?Number(match[1]):NaN;
  if(!Number.isSafeInteger(pages) || pages<1 || pages>100)
    throw new Rejected("PDF_PAGE_COUNT_UNSUPPORTED");
  if(/^Encrypted:\s*yes/im.test(info))
    throw new Rejected("ENCRYPTED_PDF_NOT_SUPPORTED");
  const prefix=join(folder,"pdf-cover");
  await runCommand(
    "pdftoppm",["-f","1","-l","1","-singlefile",
      "-scale-to","1600","-png",file,prefix],90000
  );
  return prefix+".png";
}

async function renderVideoPoster(file:string,folder:string):Promise<string>{
  const raw=await runCommand("ffprobe",[
    "-v","error","-show_entries","format=duration:stream=codec_type,codec_name,width,height",
    "-of","json",file
  ],20000);
  let data: {
    format?:{duration?:string};
    streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number}>;
  };
  try{data=JSON.parse(raw);}catch{throw new Rejected("VIDEO_METADATA_INVALID");}
  const duration=Number(data.format?.duration);
  const videoStreams=data.streams?.filter(s=>s.codec_type==="video")??[];
  const v=videoStreams[0];
  if(!Number.isFinite(duration)||duration<=0||duration>180
    ||videoStreams.length!==1||!v
    ||!["h264","hevc"].includes(v.codec_name??"")
    ||!v.width||!v.height||v.width>1920||v.height>1080
    ||v.width*v.height>2073600
  )throw new Rejected("UNSUPPORTED_VIDEO_DURATION_OR_FORMAT");

  const png=join(folder,"video-cover.png");
  await runCommand("ffmpeg",[
    "-nostdin","-hide_banner","-loglevel","error",
    "-threads","1","-protocol_whitelist","file,pipe",
    "-i",file,"-map","0:v:0","-frames:v","1",
    "-vf","scale=1600:1600:force_original_aspect_ratio=decrease",
    "-an","-sn","-f","image2",png
  ],90000);
  return png;
}

async function inspect(job:Job):Promise<{webp:Buffer;sha256:string}>{
  const config=getMediaStorageConfig();
  const temp=await mkdtemp(join(tmpdir(),"km-document-preview-"));
  const file=join(temp,"quarantined");
  try{
    const object=await getMediaS3().send(new GetObjectCommand({
      Bucket:config.quarantineBucket,Key:job.object_key
    }));
    if(!object.Body)throw new Error("SOURCE_MISSING");
    let size=0;
    const hash=createHash("sha256");
    const handle=await open(file,"wx",0o600);
    try{
      for await(const chunk of object.Body as AsyncIterable<Uint8Array>){
        const bytes=Buffer.from(chunk);
        size+=bytes.length;
        if(size>maxSize(job.expected_mime_type) ||
          size>Number(job.expected_size_bytes))
          throw new Rejected("FILE_SIZE_INVALID");
        await handle.writeFile(bytes);
        hash.update(bytes);
      }
    }finally{await handle.close();}
    if(size!==Number(job.expected_size_bytes))
      throw new Rejected("FILE_SIZE_MISMATCH");

    const detected=await fileTypeFromFile(file);
    if(detected?.mime!==job.expected_mime_type)
      throw new Rejected("FILE_SIGNATURE_MISMATCH");
    await scanAntivirus(file);

    const png=job.expected_mime_type==="application/pdf"
      ?await renderPdfCover(file,temp)
      :await renderVideoPoster(file,temp);
    // Recode raster output to prevent carrying active document/video content.
    const webp=await sharp(await readFile(png),{
      limitInputPixels:5_000_000,failOn:"warning",animated:false
    }).rotate().resize({
      width:1600,height:1600,fit:"inside",withoutEnlargement:true
    }).webp({quality:80,effort:4}).toBuffer();
    if(!webp.length || webp.length>10*1024*1024)
      throw new Rejected("POSTER_TOO_LARGE");
    return {webp,sha256:hash.digest("hex")};
  }finally{await rm(temp,{recursive:true,force:true});}
}

async function recordFailure(job:Job,error:unknown):Promise<void>{
  const permanent=error instanceof Rejected;
  const retry=!permanent && job.attempts<3;
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const update=await db.query(
      [
        "UPDATE media_upload_sessions SET state=$3,",
        "scan_token=NULL,lease_expires_at=NULL,last_failure_code=$4",
        "WHERE id=$1 AND state='scanning' AND scan_token=$2 RETURNING asset_id"
      ].join(" "),[job.id,job.scan_token,
        retry?"uploaded":permanent?"rejected":"failed",
        permanent?error.reason:"PREVIEW_WORKER_ERROR"]
    );
    if(update.rowCount && !retry)await db.query(
      [
        "UPDATE media_assets SET scan_status=$2,preview_ready=FALSE,is_public=FALSE",
        "WHERE id=$1"
      ].join(" "),[job.asset_id,permanent?"rejected":"error"]
    );
    await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error;}
  finally{db.release();}
}

async function processJob(job:Job):Promise<void>{
  try{
    if(
      (job.expected_mime_type==="application/pdf" &&
        process.env.MEDIA_PDF_PREVIEW_ENABLED!=="true") ||
      (job.expected_mime_type==="video/mp4" &&
        process.env.MEDIA_VIDEO_POSTER_ENABLED!=="true")
    )throw new Error("PREVIEW_TYPE_DISABLED");
    const {webp,sha256}=await inspect(job);
    const key="processed/"+job.asset_id+"/"+sha256+".webp";
    const config=getMediaStorageConfig();
    await getMediaS3().send(new PutObjectCommand({
      Bucket:config.processedBucket,Key:key,
      Body:webp,ContentType:"image/webp",CacheControl:"private, no-store"
    }));
    const db=await getDatabasePool().connect();
    try{
      await db.query("BEGIN");
      const claimed=await db.query(
        [
          "UPDATE media_upload_sessions SET state='accepted',scan_token=NULL,",
          "lease_expires_at=NULL,last_failure_code=NULL",
          "WHERE id=$1 AND state='scanning' AND scan_token=$2 RETURNING asset_id"
        ].join(" "),[job.id,job.scan_token]
      );
      if(!claimed.rowCount){await db.query("ROLLBACK");return;}
      const updated=await db.query(
        [
          "UPDATE media_assets SET scan_status='clean',preview_ready=TRUE,",
          "preview_type=$2,preview_object_key=$3,checksum_sha256=$4,",
          "original_mime_type=$5,original_size_bytes=$6,scanned_at=NOW()",
          "WHERE id=$1 AND source_type='upload'",
          "AND approval_status='pending' AND is_public=FALSE RETURNING id"
        ].join(" "),[
          job.asset_id,
          job.expected_mime_type==="application/pdf"?"pdf_cover":"video_poster",
          key,sha256,job.expected_mime_type,Number(job.expected_size_bytes)
        ]
      );
      if(!updated.rowCount)throw new Error("ASSET_STATE_CHANGED");
      await db.query(
        "INSERT INTO admin_audit_logs(event_type,resource,resource_id) VALUES('media_document_preview_clean','media',$1)",
        [job.asset_id]
      );
      await db.query("COMMIT");
    }catch(error){await db.query("ROLLBACK");throw error;}
    finally{db.release();}
    try{await getMediaS3().send(new DeleteObjectCommand({
      Bucket:config.quarantineBucket,Key:job.object_key
    }));}catch{console.warn("Quarantine lifecycle will remove source later.");}
  }catch(error){await recordFailure(job,error);throw error;}
}

async function main(){
  getMediaStorageConfig();
  const job=await claimJob();
  if(!job){console.log("No PDF or MP4 preview jobs pending.");return;}
  try{await processJob(job);console.log("Generated private cover:",job.id);}
  catch{console.error("Preview job failed; state recorded:",job.id);process.exitCode=1;}
}
void main().catch(()=>{
  console.error("PDF/video preview worker infrastructure unavailable.");
  process.exitCode=1;
});
