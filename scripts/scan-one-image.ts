// Run in a separate, resource-restricted worker: npm run media:scan-one
// Requires ClamAV's updated clamscan binary and permission to private S3 buckets.
// Never mark uploaded originals as public. Only a re-encoded static WebP is distributable.
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GetObjectCommand, PutObjectCommand, DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { getDatabasePool } from "../lib/server/db";
import {
  getMediaS3, getMediaStorageConfig, MAX_IMAGE_UPLOAD_BYTES
} from "../lib/server/media-storage";

type ScanJob = {
  id: string;
  asset_id: string;
  object_key: string;
  expected_size_bytes: string;
  expected_mime_type: string;
  attempts: number;
  scan_token: string;
};

class RejectedFile extends Error {
  constructor(readonly reason: string) { super(reason); }
}

async function claimOne(): Promise<ScanJob | null> {
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const result = await db.query(
      [
        "WITH choice AS (",
        "SELECT id FROM media_upload_sessions",
        "WHERE attempts < 3",
        "AND expected_mime_type IN ('image/jpeg','image/png','image/webp') AND (",
        "(state='uploaded' AND expires_at < NOW()-INTERVAL '10 seconds')",
        "OR (state='scanning' AND lease_expires_at < NOW()))",
        "ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)",
        "UPDATE media_upload_sessions s SET state='scanning',",
        "attempts=s.attempts+1,scan_token=$1,",
        "lease_expires_at=NOW()+INTERVAL '10 minutes'",
        "FROM choice WHERE s.id=choice.id",
        "RETURNING s.id,s.asset_id,s.object_key,s.expected_size_bytes,",
        "s.expected_mime_type,s.attempts,s.scan_token"
      ].join(" "),
      [randomUUID()]
    );
    await db.query("COMMIT");
    return result.rows[0]??null;
  }catch(error){
    await db.query("ROLLBACK");
    throw error;
  }finally{db.release();}
}

async function antivirusScan(path: string): Promise<void> {
  const status = await new Promise<number>((resolve,reject)=>{
    const child=spawn("clamscan",["--infected","--no-summary","--",path],{
      stdio:"ignore"
    });
    const timer=setTimeout(()=>child.kill("SIGKILL"),120000);
    child.once("error",error=>{clearTimeout(timer);reject(error);});
    child.once("close",code=>{clearTimeout(timer);resolve(code??2);});
  });
  if(status===1)throw new RejectedFile("MALWARE_DETECTED");
  if(status!==0)throw new Error("ANTIVIRUS_UNAVAILABLE");
}

async function inspectAndNormalize(job: ScanJob): Promise<{
  bytes: Buffer;
  checksum: string;
  detectedMime: string;
}> {
  const storage=getMediaStorageConfig();
  const s3=getMediaS3();
  const temp=await mkdtemp(join(tmpdir(),"km-quarantine-"));
  const path=join(temp,"original");
  try{
    const remote=await s3.send(new GetObjectCommand({
      Bucket:storage.quarantineBucket,Key:job.object_key
    }));
    if(!remote.Body)throw new Error("MISSING_BODY");
    const file=await open(path,"wx",0o600);
    const hash=createHash("sha256");
    let size=0;
    try{
      // Do not buffer untrusted input in memory.
      for await (const chunk of remote.Body as AsyncIterable<Uint8Array>){
        const buffer=Buffer.from(chunk);
        size+=buffer.length;
        if(size>MAX_IMAGE_UPLOAD_BYTES || size>Number(job.expected_size_bytes))
          throw new RejectedFile("FILE_TOO_LARGE");
        await file.writeFile(buffer);
        hash.update(buffer);
      }
    }finally{await file.close();}
    if(size!==Number(job.expected_size_bytes))throw new RejectedFile("FILE_SIZE_MISMATCH");

    const identified=await fileTypeFromFile(path);
    if(!identified || identified.mime!==job.expected_mime_type)
      throw new RejectedFile("INVALID_IMAGE_SIGNATURE");

    await antivirusScan(path);

    const maxPixels=16_000_000;
    const image=sharp(path,{
      limitInputPixels:maxPixels,animated:false,failOn:"warning"
    });
    let metadata;
    try{metadata=await image.metadata();}
    catch{throw new RejectedFile("IMAGE_DECODING_FAILED");}
    if(!metadata.width || !metadata.height ||
       metadata.width*metadata.height>maxPixels ||
       (metadata.pages??1)>1)throw new RejectedFile("UNSAFE_IMAGE_DIMENSIONS");

    let normalized:Buffer;
    try{
      normalized=await sharp(path,{
        limitInputPixels:maxPixels,animated:false,failOn:"warning"
      }).rotate().resize({
        width:2400,height:2400,fit:"inside",withoutEnlargement:true
      }).webp({quality:84,effort:4}).toBuffer();
    }catch{throw new RejectedFile("IMAGE_REENCODE_FAILED");}
    if(normalized.length===0 || normalized.length>MAX_IMAGE_UPLOAD_BYTES)
      throw new RejectedFile("PREVIEW_TOO_LARGE");

    return {bytes:normalized,checksum:hash.digest("hex"),detectedMime:identified.mime};
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
}

async function markFailure(job:ScanJob,error:unknown) {
  const explicit=error instanceof RejectedFile;
  const code=explicit?error.reason:"SCAN_PROCESSING_ERROR";
  const retryable=!explicit && job.attempts<3;
  const db=await getDatabasePool().connect();
  try{
    await db.query("BEGIN");
    const update=await db.query(
      [
        "UPDATE media_upload_sessions SET",
        "state=$3,lease_expires_at=NULL,scan_token=NULL,last_failure_code=$4",
        "WHERE id=$1 AND state='scanning' AND scan_token=$2",
        "RETURNING asset_id"
      ].join(" "),[job.id,job.scan_token,
        retryable?"uploaded":explicit?"rejected":"failed",code]
    );
    if(update.rowCount && !retryable){
      await db.query(
        [
          "UPDATE media_assets SET scan_status=$2,preview_ready=FALSE,is_public=FALSE",
          "WHERE id=$1"
        ].join(" "),[job.asset_id,explicit?"rejected":"error"]
      );
    }
    await db.query("COMMIT");
  }catch(e){await db.query("ROLLBACK");throw e;}
  finally{db.release();}
}

async function processOne(job:ScanJob) {
  try{
    const {bytes,checksum,detectedMime}=await inspectAndNormalize(job);
    const storage=getMediaStorageConfig();
    const client=getMediaS3();
    const previewKey="processed/"+job.asset_id+"/"+checksum+".webp";
    await client.send(new PutObjectCommand({
      Bucket:storage.processedBucket,Key:previewKey,
      Body:bytes,ContentType:"image/webp",
      CacheControl:"private, no-store"
    }));
    const db=await getDatabasePool().connect();
    try{
      await db.query("BEGIN");
      const claimed=await db.query(
        [
          "UPDATE media_upload_sessions SET state='accepted',",
          "scan_token=NULL,lease_expires_at=NULL,last_failure_code=NULL",
          "WHERE id=$1 AND state='scanning' AND scan_token=$2",
          "RETURNING asset_id"
        ].join(" "),[job.id,job.scan_token]
      );
      if(!claimed.rowCount){
        await db.query("ROLLBACK");
        return; // A different worker owns the job; no public DB state changed.
      }
      await db.query(
        [
          "UPDATE media_assets SET scan_status='clean',preview_ready=TRUE,",
          "preview_object_key=$2,original_mime_type=$3,original_size_bytes=$4,",
          "checksum_sha256=$5,scanned_at=NOW()",
          "WHERE id=$1 AND source_type='upload' AND approval_status='pending'",
          "AND is_public=FALSE"
        ].join(" "),
        [job.asset_id,previewKey,detectedMime,Number(job.expected_size_bytes),checksum]
      );
      await db.query(
        [
          "INSERT INTO admin_audit_logs(event_type,resource,resource_id)",
          "VALUES('media_image_scan_clean','media',$1)"
        ].join(" "),[job.asset_id]
      );
      await db.query("COMMIT");
    }catch(e){await db.query("ROLLBACK");throw e;}
    finally{db.release();}
    // Best-effort cleanup. Configure lifecycle expiration on quarantine bucket too.
    try{await client.send(new DeleteObjectCommand({
      Bucket:storage.quarantineBucket,Key:job.object_key
    }));}catch{
      console.warn("Quarantine cleanup deferred to S3 lifecycle.");
    }
  }catch(error){
    await markFailure(job,error);
    throw error;
  }
}

async function main() {
  getMediaStorageConfig(); // Fail closed until feature and private storage are configured.
  const job=await claimOne();
  if(!job){console.log("No eligible image uploads to scan.");return;}
  try{
    await processOne(job);
    console.log("Processed one uploaded image:",job.id);
  }catch{
    // Do not print image bytes, storage credentials or uploader personal data.
    console.error("Media scan failed; retry or rejection state recorded:",job.id);
    process.exitCode=1;
  }
}
void main().catch(()=>{
  console.error("Media worker infrastructure unavailable.");
  process.exitCode=1;
});
