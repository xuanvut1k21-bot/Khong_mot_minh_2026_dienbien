import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  adminSessionCookieName, readAdminSession, type AdminIdentity
} from "@/lib/server/admin-security";

// All editorial writes require same-origin browser requests and a configured HTTPS site.
export function validateAdminWriteOrigin(request: NextRequest): boolean {
  const configured = process.env.APP_BASE_URL;
  if (!configured) return false;
  try {
    const expected = new URL(configured);
    return (
      expected.origin === request.nextUrl.origin &&
      request.headers.get("origin") === expected.origin &&
      (process.env.NODE_ENV !== "production" || expected.protocol === "https:")
    );
  } catch { return false; }
}

export async function authenticateAdmin(request: NextRequest): Promise<AdminIdentity | null> {
  return readAdminSession(request.cookies.get(adminSessionCookieName())?.value);
}

export async function parseJsonBody<T>(
  request: NextRequest, schema: z.ZodType<T>
): Promise<T | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 16000) return null;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16000) return null;
    return schema.parse(JSON.parse(raw));
  } catch { return null; }
}

export async function permitted(
  db: PoolClient, actorId: string, action: string,
  organizationId: string, activityId: string | null = null
): Promise<boolean> {
  const result = await db.query(
    [
      "SELECT EXISTS (SELECT 1 FROM admin_role_assignments a",
      "JOIN admin_role_permissions p ON p.role_code=a.role_code",
      "JOIN admin_users u ON u.id=a.user_id",
      "WHERE u.id=$1 AND u.enabled=TRUE",
      "AND p.resource='activities' AND p.action=$2",
      "AND (a.scope_type='global'",
      "OR (a.scope_type='unit' AND a.scope_id=$3::uuid)",
      "OR (a.scope_type='record' AND a.scope_id=$4::uuid))) AS allowed"
    ].join(" "),
    [actorId,action,organizationId,activityId]
  );
  return result.rows[0]?.allowed === true;
}

export async function recordActivityEvent(
  db: PoolClient, actorId: string, activityId: string,
  action: string, before: string | null, after: string | null
): Promise<void> {
  await db.query(
    [
      "INSERT INTO activity_review_events",
      "(activity_id,actor_id,action,from_status,to_status)",
      "VALUES($1,$2,$3,$4,$5)"
    ].join(" "),
    [activityId,actorId,action,before,after]
  );
  await db.query(
    [
      "INSERT INTO admin_audit_logs(actor_id,event_type,resource,resource_id)",
      "VALUES($1,$2,'activities',$3)"
    ].join(" "),
    [actorId, "activity_" + action, activityId]
  );
}

export class EditorialError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof EditorialError) return NextResponse.json(
    { error: error.code }, { status: error.status }
  );
  // Unique slug constraint (SQLSTATE 23505).
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return NextResponse.json({error:"DUPLICATE_VALUE"}, {status:409});
  }
  return NextResponse.json({ error:"EDITORIAL_UNAVAILABLE" }, { status:503 });
}

export const activityIdSchema = z.string().uuid();
export const activityBodySchema = z.object({
  title: z.string().trim().min(3).max(300),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  summary: z.string().trim().max(10000),
  category: z.enum(["workshop","five_minutes","training","ambassador","community"]),
  startsAt: z.string().datetime({offset:true}).nullable(),
  location: z.string().trim().max(220).nullable()
}).strict();
