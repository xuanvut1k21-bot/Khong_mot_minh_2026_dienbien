import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieName, cookieSecurity, getOidcConfiguration, sha256 } from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let config;
  try { config = getOidcConfiguration(); }
  catch { return new Response("AUTH_NOT_CONFIGURED", { status: 503 }); }

  // Protect state-changing requests from cross-site form submissions.
  if (
    request.headers.get("origin") !== config.appOrigin ||
    request.nextUrl.origin !== config.appOrigin
  ) return new Response("INVALID_ORIGIN", { status: 403 });

  const raw = request.cookies.get(adminSessionCookieName())?.value;
  if (raw && /^[\w-]{43}$/.test(raw) && process.env.DATABASE_URL) {
    try {
      const db = await getDatabasePool().connect();
      try {
        await db.query("BEGIN");
        const sessions = await db.query(
          "UPDATE admin_sessions SET revoked_at=NOW() WHERE token_sha256=$1 AND revoked_at IS NULL RETURNING user_id",
          [sha256(raw)]
        );
        if (sessions.rowCount) {
          await db.query(
            "INSERT INTO admin_audit_logs(actor_id,event_type,resource) VALUES($1,'logout','admin_session')",
            [sessions.rows[0].user_id]
          );
        }
        await db.query("COMMIT");
      } catch {
        await db.query("ROLLBACK");
        return new Response("LOGOUT_UNAVAILABLE", { status: 503 });
      } finally { db.release(); }
    } catch {
      return new Response("LOGOUT_UNAVAILABLE", { status: 503 });
    }
  }

  const response = NextResponse.redirect(new URL("/admin", config.appOrigin), 303);
  response.cookies.set(adminSessionCookieName(), "", {
    maxAge: 0, httpOnly: true, secure: cookieSecurity(), sameSite: "lax", path: "/"
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
