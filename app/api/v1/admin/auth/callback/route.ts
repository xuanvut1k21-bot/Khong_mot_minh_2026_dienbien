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
    response.cookies.set(oidcStateCookieName(), "", {
      maxAge: 0, httpOnly: true, secure: cookieSecurity(), sameSite: "lax", path: "/api/v1/admin/auth"
    });
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
      code_verifier: flow.verifier,
      client_id: config.clientId,
      client_secret: config.clientSecret
    });
    const tokens = await fetch(config.tokenUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
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
      // Serialize first-admin bootstrap and normal provisioning checks.
      await db.query("SELECT pg_advisory_xact_lock($1)", [731926031]);
      const user = await db.query(
        [
          "SELECT id FROM admin_users",
          "WHERE oidc_issuer = $1 AND oidc_subject = $2",
          "AND enabled = TRUE FOR UPDATE"
        ].join(" "),
        [config.issuer, verified.subject]
      );

      let userId: string;
      if (user.rowCount === 1) {
        userId = user.rows[0].id;
      } else {
        const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
        if (!bootstrapEmail || verified.email !== bootstrapEmail) {
          await db.query("ROLLBACK");
          return fail();
        }
        const state = await db.query(
          "SELECT completed_at FROM admin_bootstrap_state WHERE id = 1 FOR UPDATE"
        );
        const existing = await db.query("SELECT EXISTS (SELECT 1 FROM admin_users) AS has_users");
        if (
          state.rowCount !== 1 || state.rows[0].completed_at !== null ||
          existing.rows[0]?.has_users === true
        ) {
          await db.query("ROLLBACK");
          return fail();
        }
        const created = await db.query(
          [
            "INSERT INTO admin_users",
            "(oidc_issuer, oidc_subject, display_name, enabled)",
            "VALUES ($1, $2, $3, TRUE) RETURNING id"
          ].join(" "),
          [config.issuer, verified.subject, verified.displayName]
        );
        userId = created.rows[0].id;
        await db.query(
          "INSERT INTO admin_role_assignments(user_id, role_code, scope_type, scope_id) VALUES($1, 'technical_admin', 'global', NULL)",
          [userId]
        );
        await db.query(
          "UPDATE admin_bootstrap_state SET completed_at = NOW(), completed_by = $1 WHERE id = 1 AND completed_at IS NULL",
          [userId]
        );
        await db.query(
          "INSERT INTO admin_audit_logs(actor_id,event_type,resource) VALUES($1,'first_admin_bootstrap','admin_users')",
          [userId]
        );
      }
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
