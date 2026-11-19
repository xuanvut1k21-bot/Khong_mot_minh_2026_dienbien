import { S3Client } from "@aws-sdk/client-s3";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 80 * 1024 * 1024;
export const MEDIA_UPLOAD_MIMES = [
  "image/jpeg","image/png","image/webp","application/pdf","video/mp4"
] as const;
export type MediaUploadMime = (typeof MEDIA_UPLOAD_MIMES)[number];
export function isAllowedUpload(
  mime: MediaUploadMime, category: string, size: number
): boolean {
  if (!Number.isSafeInteger(size) || size < 1) return false;
  if (mime === "application/pdf") {
    return process.env.MEDIA_PDF_PREVIEW_ENABLED === "true" &&
      category === "handbook" && size <= MAX_PDF_UPLOAD_BYTES;
  }
  if (mime === "video/mp4") {
    return process.env.MEDIA_VIDEO_POSTER_ENABLED === "true" &&
      category === "video" && size <= MAX_VIDEO_UPLOAD_BYTES;
  }
  return ["photo","infographic","brand","ambassador"].includes(category) &&
    size <= MAX_IMAGE_UPLOAD_BYTES;
}
export const ACCEPTED_IMAGE_MIMES = ["image/jpeg","image/png","image/webp"] as const;
export type ImageMime = (typeof ACCEPTED_IMAGE_MIMES)[number];

export type MediaStorageConfig = {
  region:string;quarantineBucket:string;processedBucket:string;
};

export function getMediaStorageConfig():MediaStorageConfig {
  if(process.env.MEDIA_IMAGE_UPLOADS_ENABLED!=="true")
    throw new Error("MEDIA_IMAGE_UPLOADS_DISABLED");
  const region=process.env.AWS_REGION?.trim();
  const quarantineBucket=process.env.MEDIA_QUARANTINE_BUCKET?.trim();
  const processedBucket=process.env.MEDIA_PROCESSED_BUCKET?.trim();
  if(!region||!quarantineBucket||!processedBucket||quarantineBucket===processedBucket)
    throw new Error("MEDIA_STORAGE_UNCONFIGURED");
  return {region,quarantineBucket,processedBucket};
}

let cachedClient:S3Client|undefined;
export function getMediaS3():S3Client {
  const config=getMediaStorageConfig();
  if(!cachedClient)cachedClient=new S3Client({region:config.region});
  return cachedClient;
}
