import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/server/activity-editorial";
import { getDatabasePool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await authenticateAdmin(request);
  if (!actor) return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  try {
    const result = await getDatabasePool().query(
      [
        "SELECT o.id,o.public_name FROM organizations o",
        "WHERE o.active=TRUE AND EXISTS(",
        "SELECT 1 FROM admin_role_assignments a",
        "JOIN admin_role_permissions p ON p.role_code=a.role_code",
        "WHERE a.user_id=$1 AND p.resource='activities' AND p.action='edit'",
        "AND (a.scope_type='global' OR (a.scope_type='unit' AND a.scope_id=o.id)))",
        "ORDER BY o.public_name LIMIT 100"
      ].join(" "),[actor.id]
    );
    return NextResponse.json(
      {items:result.rows},{headers:{"Cache-Control":"no-store"}}
    );
  } catch {
    return NextResponse.json({error:"UNITS_UNAVAILABLE"},{status:503});
  }
}
