// Safe, deterministic, credential-free staging preflight policy.
// Never return actual values from secrets, URLs containing credentials, or tokens.
export type StagingCheck={id:string;ok:boolean;reason:string};
export type StagingReport={ready:boolean;checks:StagingCheck[]};
type Env=Record<string,string|undefined>;

function checkUrl(value:string|undefined,root=false):boolean{
  if(!value)return false;
  try{
    const u=new URL(value);
    if(u.protocol!=="https:" || u.username || u.password ||
       u.search || u.hash || u.port && u.port!=="443" ||
       !u.hostname.includes(".") || u.hostname==="localhost" ||
       /(?:^|\.)(example|test|invalid)$/.test(u.hostname) ||
       u.hostname.includes("placeholder"))return false;
    if(root && u.pathname!=="/")return false;
    return true;
  }catch{return false;}
}
export function stagingReadiness(env:Env):StagingReport{
  const checks:StagingCheck[]=[];
  function add(id:string,ok:boolean,reason:string){
    checks.push({id,ok,reason});
  }
  add("explicit_staging_target",
    env.STAGING_DEPLOYMENT_TARGET==="staging",
    "Chỉ chạy với STAGING_DEPLOYMENT_TARGET=staging");
  add("runtime_production_mode",
    env.NODE_ENV==="production",
    "Cần kiểm tra cấu hình ở NODE_ENV=production, không dựa vào chế độ dev");
  add("public_https_origin",
    checkUrl(env.APP_BASE_URL,true),
    "APP_BASE_URL phải là gốc website HTTPS thật, không phải localhost/ví dụ");
  const db=env.DATABASE_URL;
  let safeDb=false;
  try{
    const u=new URL(db??"");
    safeDb=["postgres:","postgresql:"].includes(u.protocol) &&
      Boolean(u.hostname && u.username && u.password) &&
      u.searchParams.get("sslmode")==="verify-full" &&
      !/(^|\.)(example|test|invalid)$/.test(u.hostname) &&
      !["localhost","127.0.0.1","::1"].includes(u.hostname) &&
      !u.password.includes("password");
  }catch{}
  add("postgresql_tls_verified",safeDb,
    "PostgreSQL riêng phải dùng TLS xác minh tên máy chủ (sslmode=verify-full)");
  for(const key of [
    "OIDC_ISSUER","OIDC_AUTHORIZATION_ENDPOINT","OIDC_TOKEN_ENDPOINT",
    "OIDC_JWKS_URI"
  ]){
    add("https_"+key.toLowerCase(),checkUrl(env[key]),
      key+" phải là URL HTTPS từ IdP thật, không chứa query/credential");
  }
  add("oidc_client_id",Boolean(env.OIDC_CLIENT_ID &&
      env.OIDC_CLIENT_ID.length>=4 &&
      !/CONFIGURE|EXAMPLE|PLACEHOLDER/i.test(env.OIDC_CLIENT_ID)),
    "OIDC_CLIENT_ID chưa được cấu hình hợp lệ");
  add("oidc_client_secret",Boolean(env.OIDC_CLIENT_SECRET &&
      env.OIDC_CLIENT_SECRET.length>=32 &&
      !/CONFIGURE|PLACEHOLDER/i.test(env.OIDC_CLIENT_SECRET)),
    "OIDC_CLIENT_SECRET chưa được cấp an toàn từ IdP");
  add("oidc_mfa_acr",Boolean(env.OIDC_REQUIRED_ACR &&
      env.OIDC_REQUIRED_ACR.length>=3 &&
      !/CONFIGURE|PLACEHOLDER|^none$/i.test(env.OIDC_REQUIRED_ACR)),
    "OIDC_REQUIRED_ACR chưa cấu hình; phải xác minh MFA thực tế bằng tay");
  const key=env.ADMIN_STATE_KEY_BASE64??"";
  const keyValid=/^[A-Za-z0-9+/]{43}=$/.test(key) &&
    Buffer.from(key,"base64").length===32;
  add("admin_state_key_256bit",keyValid,
    "ADMIN_STATE_KEY_BASE64 phải là khóa 32 byte ngẫu nhiên lưu trong secret store");

  for(const flag of [
    "MEDIA_IMAGE_UPLOADS_ENABLED","MEDIA_PDF_PREVIEW_ENABLED",
    "MEDIA_VIDEO_POSTER_ENABLED","TRAINING_REGISTRATION_ENABLED",
    "TRAINING_EXAM_ENABLED","TRAINING_SURVEY_WEBHOOK_ENABLED",
    "TRAINING_SURVEY_LAUNCH_ENABLED","TRAINING_RETENTION_PURGE_ENABLED",
    "TRAINING_EDGE_RATE_LIMIT_READY"
  ]){
    add("off_"+flag.toLowerCase(),env[flag]!=="true",
      flag+" phải được tắt trong staging ban đầu");
  }
  return {ready:checks.every(c=>c.ok),checks};
}
