import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookieName, adminSessionMaxAgeSeconds,
  cookieSecurity, decryptLoginState, getOidcConfiguration,
  oidcStateCookieName, randomValue, sha256, verifyOidcIdToken
} from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let config;
  try { config = getOidcConfiguration(); }
  catch { return new Response("AUTH_NOT_CONFIGURED", { status: 503 }); }

  const fail = () => {
    const response = NextResponse.redirect(new URL("/admin?login=failed", config.appOrigin), 303);
    response.cookies.delete(oidcStateCookieName());
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (request.nextUrl.origin !== config.appOrigin) return fail();

  const stateCookie = request.cookies.get(oidcStateCookieName())?.value;
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const returnedIssuer = request.nextUrl.searchParams.get("iss");
  if (!stateCookie || !code || !returnedState || code.length > 2048) return fail();
  if (returnedIssuer && returnedIssuer !== config.issuer) return fail();

  try {
    const flow = await decryptLoginState(stateCookie, config);
    if (returnedState !== flow.state) return fail();

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: flow.verifier
    });
    const basic = Buffer.from(
      config.clientId + ":" + config.clientSecret
    ).toString("base64");
    const tokens = await fetch(config.tokenUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    if (!tokens.ok) return fail();
    const result: unknown = await tokens.json();
    if (
      typeof result !== "object" || result === null ||
      !("id_token" in result) || typeof result.id_token !== "string"
    ) return fail();

    const verified = await verifyOidcIdToken(
      result.id_token, config, flow.nonce
    );
    const db = await getDatabasePool().connect();
    try {
      await db.query("BEGIN");
      const user = await db.query(
        [
          "SELECT id FROM admin_users",
          "WHERE oidc_issuer = $1 AND oidc_subject = $2",
          "AND enabled = TRUE FOR UPDATE"
        ].join(" "),
        [config.issuer, verified.subject]
      );
      if (user.rowCount !== 1) {
        await db.query("ROLLBACK");
        return fail();
      }

      const userId: string = user.rows[0].id;
      const token = randomValue();
      await db.query(
        [
          "INSERT INTO admin_sessions(user_id, token_sha256, expires_at)",
          "VALUES ($1, $2, NOW() + INTERVAL '8 hours')"
        ].join(" "), [userId, sha256(token)]
      );
      await db.query("UPDATE admin_users SET last_login_at=NOW() WHERE id=$1", [userId]);
      await db.query(
        "INSERT INTO admin_audit_logs(actor_id,event_type,resource) VALUES($1,'login','admin_session')",
        [userId]
      );
      await db.query("COMMIT");

      const response = NextResponse.redirect(new URL("/admin", config.appOrigin), 303);
      response.cookies.set(adminSessionCookieName(), token, {
        httpOnly: true, secure: cookieSecurity(), sameSite: "lax",
        path: "/", maxAge: adminSessionMaxAgeSeconds
      });
      response.cookies.delete(oidcStateCookieName());
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      await db.query("ROLLBACK");
      return fail();
    } finally { db.release(); }
  } catch {
    return fail();
  }
}
