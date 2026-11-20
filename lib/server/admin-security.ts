import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt, createRemoteJWKSet, jwtVerify } from "jose";
import { getDatabasePool } from "@/lib/server/db";

const SESSION_HOURS = 8;

export type AdminIdentity = {
  id: string;
  displayName: string | null;
};

export type OidcConfiguration = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  appOrigin: string;
  redirectUri: string;
  secret: Uint8Array;
};

function secureUrl(value: string, allowLocal = false): URL {
  const url = new URL(value);
  const local = allowLocal && url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (!local && url.protocol !== "https:") ||
    url.username || url.password || url.search || url.hash ||
    (url.port && !local && url.port !== "443")
  ) throw new Error("AUTH_URL_INVALID");
  return url;
}

export function getOidcConfiguration(): OidcConfiguration {
  const names = [
    "APP_BASE_URL", "OIDC_ISSUER", "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET", "OIDC_AUTHORIZATION_ENDPOINT",
    "OIDC_TOKEN_ENDPOINT", "OIDC_JWKS_URI",
    "ADMIN_STATE_KEY_BASE64"
  ] as const;
  for (const name of names) {
    if (!process.env[name]) throw new Error("AUTH_NOT_CONFIGURED");
  }
  const app = secureUrl(process.env.APP_BASE_URL!, true);
  if (process.env.NODE_ENV === "production" && app.protocol !== "https:") {
    throw new Error("ADMIN_REQUIRES_HTTPS");
  }
  if (app.pathname !== "/" || app.search || app.hash)
    throw new Error("APP_BASE_URL_INVALID");
  const issuer = secureUrl(process.env.OIDC_ISSUER!);
  const authorize = secureUrl(process.env.OIDC_AUTHORIZATION_ENDPOINT!);
  const token = secureUrl(process.env.OIDC_TOKEN_ENDPOINT!);
  const jwks = secureUrl(process.env.OIDC_JWKS_URI!);
  if (issuer.origin !== "https://accounts.google.com" || issuer.pathname !== "/")
    throw new Error("OIDC_ISSUER_NOT_ALLOWED");
  const decoded = Buffer.from(process.env.ADMIN_STATE_KEY_BASE64!, "base64");
  if (decoded.length !== 32) throw new Error("AUTH_KEY_INVALID");
  return {
    issuer: "https://accounts.google.com",
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    authorizeUrl: authorize.toString(),
    tokenUrl: token.toString(),
    jwksUrl: jwks.toString(),
    appOrigin: app.origin,
    redirectUri: new URL("/api/v1/admin/auth/callback", app.origin).toString(),
    secret: new Uint8Array(decoded)
  };
}

export function authConfigured(): boolean {
  try { getOidcConfiguration(); return Boolean(process.env.DATABASE_URL); }
  catch { return false; }
}

export function adminSessionCookieName(): string {
  return process.env.APP_BASE_URL?.startsWith("https://")
    ? "__Host-km_admin_session" : "km_admin_session_dev";
}

export function oidcStateCookieName(): string {
  return process.env.APP_BASE_URL?.startsWith("https://")
    ? "__Secure-km_oidc_state" : "km_oidc_state_dev";
}

export function cookieSecurity(): boolean {
  return process.env.APP_BASE_URL?.startsWith("https://") === true;
}

export function randomValue(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function encryptLoginState(
  data: { state: string; nonce: string; verifier: string },
  config: OidcConfiguration
): Promise<string> {
  return new EncryptJWT(data).setProtectedHeader({
    alg: "dir", enc: "A256GCM"
  }).setIssuedAt().setExpirationTime("5m").encrypt(config.secret);
}

export async function decryptLoginState(
  value: string, config: OidcConfiguration
): Promise<{ state: string; nonce: string; verifier: string }> {
  const { payload } = await jwtDecrypt(value, config.secret, {
    clockTolerance: 5
  });
  if (
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.verifier !== "string"
  ) throw new Error("INVALID_LOGIN_STATE");
  return {
    state: payload.state, nonce: payload.nonce, verifier: payload.verifier
  };
}

export async function verifyOidcIdToken(
  token: string, config: OidcConfiguration, expectedNonce: string
): Promise<{ subject: string; email: string; displayName: string | null }> {
  const keySet = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5000,
    cooldownDuration: 30000
  });
  const { payload } = await jwtVerify(token, keySet, {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: ["RS256"],
    clockTolerance: 30
  });
  if (
    typeof payload.sub !== "string" || !payload.sub ||
    payload.nonce !== expectedNonce ||
    typeof payload.email !== "string" ||
    payload.email.length > 320 ||
    payload.email_verified !== true ||
    (Array.isArray(payload.aud) && payload.aud.length > 1 &&
      payload.azp !== config.clientId)
  ) throw new Error("OIDC_CLAIM_VALIDATION_FAILED");
  // The stable Google subject is matched to a pre-provisioned admin_users row.
  // Email is verified as an account attribute, never used as the authorization key.
  const email = payload.email.trim().toLowerCase();
  const displayName = typeof payload.name === "string" ? payload.name.slice(0, 220) : null;
  return { subject: payload.sub, email, displayName };
}

export async function readAdminSession(
  rawToken: string | undefined
): Promise<AdminIdentity | null> {
  if (!rawToken || !/^[\w-]{43}$/.test(rawToken) || !process.env.DATABASE_URL)
    return null;
  try {
    const { rows } = await getDatabasePool().query(
      [
        "SELECT u.id, u.display_name",
        "FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id",
        "WHERE s.token_sha256 = $1 AND s.revoked_at IS NULL",
        "AND s.expires_at > NOW() AND u.enabled = TRUE LIMIT 1"
      ].join(" "), [sha256(rawToken)]
    );
    if (rows.length !== 1) return null;
    return { id: rows[0].id, displayName: rows[0].display_name };
  } catch { return null; }
}

export async function currentAdminSession(): Promise<AdminIdentity | null> {
  const store = await cookies();
  return readAdminSession(store.get(adminSessionCookieName())?.value);
}

export async function hasAdminPermission(
  userId: string,
  resource: string,
  action: string,
  unitId: string | null = null,
  recordId: string | null = null
): Promise<boolean> {
  const { rows } = await getDatabasePool().query(
    [
      "SELECT EXISTS (SELECT 1",
      "FROM admin_role_assignments a",
      "JOIN admin_role_permissions p ON p.role_code = a.role_code",
      "JOIN admin_users u ON u.id = a.user_id",
      "WHERE u.id = $1 AND u.enabled = TRUE AND p.resource = $2 AND p.action = $3",
      "AND (a.scope_type = 'global'",
      "OR (a.scope_type = 'unit' AND a.scope_id = $4::uuid)",
      "OR (a.scope_type = 'record' AND a.scope_id = $5::uuid))) AS permitted"
    ].join(" "), [userId, resource, action, unitId, recordId]
  );
  return rows[0]?.permitted === true;
}

export const adminSessionMaxAgeSeconds = SESSION_HOURS * 60 * 60;
