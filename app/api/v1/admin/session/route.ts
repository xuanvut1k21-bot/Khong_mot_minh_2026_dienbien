import { NextResponse } from "next/server";
import { currentAdminSession } from "@/lib/server/admin-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentAdminSession();
  const response = NextResponse.json(
    session ? { authenticated: true, displayName: session.displayName }
            : { authenticated: false }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
