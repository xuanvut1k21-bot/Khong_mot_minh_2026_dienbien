import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { expect, test, vi } from "vitest";
import { getDatabasePool } from "@/lib/server/db";
import { POST as register } from "@/app/api/v1/admin/media/route";
import { POST as review } from "@/app/api/v1/admin/media/[id]/review/route";
import { POST as link } from "@/app/api/v1/admin/activities/[id]/assets/route";
import { GET as publicMedia } from "@/app/api/v1/activities/[slug]/media/route";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/server/admin-security", () => ({
  adminSessionCookieName: () => "test-session",
  authConfigured: () => true,
  readAdminSession: async () => ({ id: identity.id })
}));

test("independent review controls activity media visibility through revocation", async () => {
  const database = process.env.TEST_DATABASE_URL;
  if (!database || new URL(database).pathname !== "/km_test") throw Error("Requires disposable km_test");
  const origin = "https://media.example.test";
  vi.stubEnv("DATABASE_URL", database);
  vi.stubEnv("APP_BASE_URL", origin);
  const db = getDatabasePool();
  const slug = randomUUID();
  const driveUrl = "https://drive.google.com/file/d/" + randomUUID() + "/view";
  const author = randomUUID(), reviewer = randomUUID(), unit = randomUUID(), activity = randomUUID();
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const approvals = { action: "approve", rightsHolder: "Test unit", rightsBasis: "Synthetic fixture only",
    rightsEvidenceRef: "CI-TEST", rightsConfirmed: true, privacyConfirmed: true, safetyConfirmed: true };

  function post(actor: string, path: string, body: object) {
    identity.id = actor;
    return new NextRequest(origin + path, { method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body) });
  }
  async function visibleIds() {
    const response = await publicMedia(new NextRequest(origin + "/api/v1/activities/" + slug + "/media"),
      { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.dataStatus).toBe("available");
    return data.items.map((item: { id: string }) => item.id);
  }

  try {
    await db.query("INSERT INTO organizations(id,public_name) VALUES ($1,'CI media unit')", [unit]);
    for (const id of [author, reviewer]) {
      await db.query("INSERT INTO admin_users(id,oidc_issuer,oidc_subject,enabled) VALUES ($1,'test',$2,true)", [id,id]);
    }
    // Both can review: a self-review must fail because of identity, independently of role.
    for (const role of ["activity_editor","activity_approver","media_editor","media_approver"]) {
      await db.query("INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id) VALUES ($1,$2,'unit',$3)", [author,role,unit]);
    }
    for (const role of ["activity_approver","media_approver"]) {
      await db.query("INSERT INTO admin_role_assignments(user_id,role_code,scope_type,scope_id) VALUES ($1,$2,'unit',$3)", [reviewer,role,unit]);
    }
    await db.query(`INSERT INTO activities(id,organization_id,slug,title,category_code,created_by,publish_status,published_at)
      VALUES ($1,$2,$3,'CI media activity','workshop',$4,'published',NOW())`, [activity,unit,slug,author]);
    const created = await register(post(author, "/api/v1/admin/media", {
      title: "CI sample", category: "handbook", organizationId: unit, driveUrl
    }));
    expect(created.status).toBe(201);
    const { asset } = await created.json();
    expect(asset.approval_status).toBe("pending");
    const reviewAsset = (actor: string, body: object) => review(post(actor, "/api/v1/admin/media/" + asset.id + "/review", body), context(asset.id));
    const changeLink = (actor: string, body: object) => link(post(actor, "/api/v1/admin/activities/" + activity + "/assets", body), context(activity));

    expect((await reviewAsset(author, approvals)).status).toBe(409);
    expect((await reviewAsset(reviewer, approvals)).status).toBe(200);
    expect(await visibleIds()).toEqual([]);
    const proposed = await changeLink(author, { action: "propose", mediaId: asset.id });
    expect(proposed.status).toBe(200);
    const { linkId } = await proposed.json();
    expect(await visibleIds()).toEqual([]);
    expect((await changeLink(author, { action: "approve", linkId })).status).toBe(409);
    expect((await changeLink(reviewer, { action: "approve", linkId })).status).toBe(200);
    expect(await visibleIds()).toEqual([asset.id]);
    expect((await reviewAsset(reviewer, { action: "revoke", reason: "CI withdrawal test" })).status).toBe(200);
    expect(await visibleIds()).toEqual([]);

    const mediaEvents = await db.query("SELECT action,actor_id FROM media_review_events WHERE asset_id=$1 ORDER BY action", [asset.id]);
    expect(mediaEvents.rows).toEqual([
      { action: "approve", actor_id: reviewer }, { action: "create", actor_id: author }, { action: "revoke", actor_id: reviewer }
    ]);
    const linkEvents = await db.query("SELECT action,actor_id FROM activity_asset_events WHERE link_id=$1 ORDER BY action", [linkId]);
    expect(linkEvents.rows).toEqual([{ action: "approve", actor_id: reviewer }, { action: "propose", actor_id: author }]);
  } finally {
    await db.end();
    vi.unstubAllEnvs();
  }
});
