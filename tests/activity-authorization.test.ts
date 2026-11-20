import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { expect, test, vi } from "vitest";
import { getDatabasePool } from "@/lib/server/db";
import { POST as transition } from "@/app/api/v1/admin/activities/[id]/transition/route";
import { POST as results } from "@/app/api/v1/admin/activities/[id]/results/route";

// The routes receive an authenticated fixture identity. Authorization, SQL and audit are real.
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/server/admin-security", () => ({
  adminSessionCookieName: () => "test-session",
  authConfigured: () => true,
  readAdminSession: async () => ({ id: identity.id })
}));

test("unit scope, record scope and independent review are enforced by activity routes", async () => {
  const database = process.env.TEST_DATABASE_URL;
  assert(database && new URL(database).pathname === "/km_test", "Requires the disposable km_test database");
  const origin = "https://activities.example.test";
  vi.stubEnv("DATABASE_URL", database);
  vi.stubEnv("APP_BASE_URL", origin);
  const db = getDatabasePool();

  async function id(sql: string, params: string[]) {
    return (await db.query<{id: string}>(sql, params)).rows[0].id;
  }
  function user() {
    return id("INSERT INTO admin_users(oidc_issuer,oidc_subject,enabled) VALUES ('test', $1, TRUE) RETURNING id", [randomUUID()]);
  }
  function unit(name: string) {
    return id("INSERT INTO organizations(public_name) VALUES ($1) RETURNING id", [name]);
  }
  function activity(unitId: string, author: string) {
    return id(`INSERT INTO activities(organization_id,slug,title,category_code,created_by,starts_at)
      VALUES ($1,$2,'API authorization test','workshop',$3,NOW()) RETURNING id`, [unitId, randomUUID(), author]);
  }
  async function post(actor: string, activityId: string, endpoint: "transition" | "results", payload: Record<string, unknown>) {
    identity.id = actor;
    const request = new NextRequest(origin + "/api/v1/admin/activities/" + activityId + "/" + endpoint, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    return (endpoint === "transition" ? transition : results)(request, { params: Promise.resolve({ id: activityId }) });
  }
  async function denied(response: Response, error: string) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error });
  }

  try {
    const author = await user(), reviewer = await user();
    const unitA = await unit("API test A"), unitB = await unit("API test B");
    const assigned = await activity(unitA, author);
    const sameUnitOtherRecord = await activity(unitA, author);
    const otherUnit = await activity(unitB, reviewer);
    await db.query(`INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id) VALUES
      ($1,'activity_editor','unit',$3), ($1,'activity_approver','unit',$3),
      ($2,'activity_approver','record',$4)`, [author, reviewer, unitA, assigned]);

    await denied(await post(author, otherUnit, "transition", { action: "submit" }), "FORBIDDEN");
    for (const record of [assigned, sameUnitOtherRecord]) {
      expect((await post(author, record, "transition", { action: "submit" })).status).toBe(200);
    }
    await denied(await post(reviewer, sameUnitOtherRecord, "transition", { action: "approve" }), "FORBIDDEN");
    await denied(await post(author, assigned, "transition", { action: "approve" }), "SEPARATION_REQUIRED");
    expect((await post(reviewer, assigned, "transition", { action: "approve" })).status).toBe(200);
    await denied(await post(author, assigned, "transition", { action: "publish" }), "SEPARATION_REQUIRED");
    expect((await post(reviewer, assigned, "transition", { action: "publish" })).status).toBe(200);
    expect((await post(author, assigned, "transition", { action: "complete" })).status).toBe(200);
    expect((await post(author, assigned, "results", {
      action: "save", sessionsCount: 1, attendanceCount: 20, summary: "Synthetic result for review"
    })).status).toBe(200);
    await denied(await post(author, assigned, "results", { action: "verify" }), "SEPARATION_REQUIRED");
    expect((await post(reviewer, assigned, "results", { action: "verify" })).status).toBe(200);

    const states = await db.query("SELECT id,publish_status FROM activities WHERE id=ANY($1::uuid[])", [[otherUnit, sameUnitOtherRecord]]);
    expect(Object.fromEntries(states.rows.map(r => [r.id, r.publish_status]))).toEqual({
      [otherUnit]: "draft", [sameUnitOtherRecord]: "pending"
    });
    const audit = await db.query("SELECT activity_id,action,actor_id FROM activity_review_events WHERE activity_id=ANY($1::uuid[])", [[assigned, sameUnitOtherRecord, otherUnit]]);
    const actual = audit.rows.map(r => [r.activity_id, r.action, r.actor_id]);
    const expected = [
      [sameUnitOtherRecord, "submit", author], [assigned, "submit", author],
      [assigned, "approve", reviewer], [assigned, "publish", reviewer],
      [assigned, "complete", author], [assigned, "save_result", author], [assigned, "verify_result", reviewer]
    ];
    expect(actual.sort()).toEqual(expected.sort());
  } finally {
    await db.end();
    vi.unstubAllEnvs();
  }
});
