import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getMediaS3, getMediaStorageConfig, MAX_IMAGE_UPLOAD_BYTES } from "./media-storage";

export function checkedPreviewKey(
  mediaId: string, sha256: string, key: string
): string | null {
  const expected="processed/"+mediaId+"/"+sha256+".webp";
  return key===expected && /^[a-f0-9]{64}$/.test(sha256) ? key : null;
}

export async function loadProcessedImage(key: string): Promise<Uint8Array> {
  const storage=getMediaStorageConfig();
  const output=await getMediaS3().send(new GetObjectCommand({
    Bucket:storage.processedBucket,Key:key
  }));
  if(!output.Body || output.ContentType!=="image/webp" ||
     !output.ContentLength || output.ContentLength>MAX_IMAGE_UPLOAD_BYTES){
    throw new Error("UNSAFE_PREVIEW_OBJECT");
  }
  const bytes=await output.Body.transformToByteArray();
  if(!bytes.length || bytes.length>MAX_IMAGE_UPLOAD_BYTES)
    throw new Error("UNSAFE_PREVIEW_SIZE");
  return bytes;
}

export function imageResponse(bytes: Uint8Array): Response {
  return new Response(Buffer.from(bytes),{
    status:200,
    headers:{
      "Content-Type":"image/webp",
      "Content-Disposition":'inline; filename="campaign-image.webp"',
      "Cache-Control":"private, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff",
      "Cross-Origin-Resource-Policy":"same-origin",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; sandbox"
    }
  });
}
