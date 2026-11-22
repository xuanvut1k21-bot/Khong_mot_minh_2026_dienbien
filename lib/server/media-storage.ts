import { S3Client } from "@aws-sdk/client-s3";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
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
