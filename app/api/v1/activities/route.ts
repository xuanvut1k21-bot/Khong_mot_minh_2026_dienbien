import { NextRequest, NextResponse } from "next/server";
import { activityCategories, getPublishedActivities, type ActivityCategory } from "@/lib/server/public-content";
import { isDatabaseConfigured } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const pageRaw = params.get("page") ?? "1";
  const page = Number(pageRaw);
  if (
    (category !== null && !activityCategories.includes(category as ActivityCategory)) ||
    !/^[1-9]\d*$/.test(pageRaw) || !Number.isSafeInteger(page) || page > 10000
  ) return NextResponse.json({ error: "INVALID_FILTER" }, { status: 400 });

  const headers = { "Cache-Control": "no-store" };
  if (!isDatabaseConfigured()) return NextResponse.json(
    { items: [], hasMore: false, dataStatus: "not_configured" }, { headers }
  );

  try {
    const data = await getPublishedActivities({
      category: (category ?? undefined) as ActivityCategory | undefined, page
    });
    return NextResponse.json({ ...data, dataStatus: "available" }, { headers });
  } catch {
    return NextResponse.json({ error: "CONTENT_UNAVAILABLE" }, { status: 503, headers });
  }
}
