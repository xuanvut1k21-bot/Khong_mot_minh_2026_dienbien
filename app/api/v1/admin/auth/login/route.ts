import { NextRequest, NextResponse } from "next/server";
import {
  getOidcConfiguration, encryptLoginState,
  pkceChallenge, randomValue, oidcStateCookieName, cookieSecurity
} from "@/lib/server/admin-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let config;
  try { config = getOidcConfiguration(); }
  catch {
    return new Response("Đăng nhập quản trị chưa được cấu hình.", { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return new Response("AUTH_DATABASE_NOT_CONFIGURED", { status: 503 });
  }
  if (request.nextUrl.origin !== config.appOrigin) {
    return new Response("INVALID_ORIGIN", { status: 400 });
  }
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue();
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  const response = NextResponse.redirect(url, 302);
  response.cookies.set(oidcStateCookieName(),
    await encryptLoginState({ state, nonce, verifier }, config),
    {
      httpOnly: true, secure: cookieSecurity(), sameSite: "lax",
      path: "/api/v1/admin/auth", maxAge: 300
    }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
