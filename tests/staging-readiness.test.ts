import assert from "node:assert/strict";
import test from "node:test";
import { stagingReadiness } from "../lib/staging-readiness";
function example(){
  return {
    STAGING_DEPLOYMENT_TARGET:"staging",
    NODE_ENV:"production",
    APP_BASE_URL:"https://staging.khongmotminh.vn",
    DATABASE_URL:"postgresql://staging:UniqueRandomSecret98765@database.internal.vn:5432/km?sslmode=verify-full",
    OIDC_ISSUER:"https://sso.identity.vn/realms/km",
    OIDC_AUTHORIZATION_ENDPOINT:"https://sso.identity.vn/realms/km/protocol/openid-connect/auth",
    OIDC_TOKEN_ENDPOINT:"https://sso.identity.vn/realms/km/protocol/openid-connect/token",
    OIDC_JWKS_URI:"https://sso.identity.vn/realms/km/protocol/openid-connect/certs",
    OIDC_CLIENT_ID:"test-staging",
    OIDC_CLIENT_SECRET:"synthetic-secret-not-for-use-987654321",
    OIDC_REQUIRED_ACR:"urn:example:acr:mfa", // Test fixture only: verify real IdP mapping in staging.
    ADMIN_STATE_KEY_BASE64:Buffer.alloc(32,7).toString("base64"),
    MEDIA_IMAGE_UPLOADS_ENABLED:"false",
    MEDIA_PDF_PREVIEW_ENABLED:"false",
    MEDIA_VIDEO_POSTER_ENABLED:"false",
    TRAINING_REGISTRATION_ENABLED:"false",
    TRAINING_EXAM_ENABLED:"false",
    TRAINING_SURVEY_WEBHOOK_ENABLED:"false",
    TRAINING_SURVEY_LAUNCH_ENABLED:"false",
    TRAINING_RETENTION_PURGE_ENABLED:"false",
    TRAINING_EDGE_RATE_LIMIT_READY:"false"
  };
}
test("staging report checks safe synthetic configuration",()=>{
  const result=stagingReadiness(example());
  assert.equal(result.ready,true,
    result.checks.filter(x=>!x.ok).map(x=>x.id).join(", "));
  assert.ok(result.checks.length>15);
});
test("reject insecure origin and weak OIDC config",()=>{
  const config={...example(),APP_BASE_URL:"http://localhost:3000",
    ADMIN_STATE_KEY_BASE64:"not-a-key",
    OIDC_CLIENT_SECRET:"CONFIGURE_PRIVATE_CLIENT_SECRET"};
  const result=stagingReadiness(config);
  assert.equal(result.ready,false);
  for(const key of ["public_https_origin","admin_state_key_256bit","oidc_client_secret"])
    assert.equal(result.checks.find(x=>x.id===key)?.ok,false);
});
test("fail closed with real features enabled",()=>{
  const config={...example(),TRAINING_REGISTRATION_ENABLED:"true",
    TRAINING_RETENTION_PURGE_ENABLED:"true",MEDIA_IMAGE_UPLOADS_ENABLED:"true"};
  const result=stagingReadiness(config);
  assert.equal(result.ready,false);
  assert.equal(result.checks.filter(x=>!x.ok).length,3);
});
test("reject database without hostname verification",()=>{
  const config={...example(),DATABASE_URL:
    "postgresql://staging:Secret1234@localhost:5432/km?sslmode=require"};
  assert.equal(stagingReadiness(config).checks.find(x=>x.id==="postgresql_tls_verified")?.ok,false);
});
test("report does not expose credential strings",()=>{
  const config=example();
  const output=JSON.stringify(stagingReadiness(config));
  assert.ok(!output.includes(config.DATABASE_URL));
  assert.ok(!output.includes(config.OIDC_CLIENT_SECRET));
  assert.ok(!output.includes(config.ADMIN_STATE_KEY_BASE64));
});
