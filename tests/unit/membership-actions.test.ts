import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeQuery, findFilter } from "./helpers/fake-supabase";

/**
 * Platform-admin membership management (ADR-040): the guard runs before the service role is
 * touched, the organization in the form must match the row, transitions are validated, the
 * last active owner is protected, writes are conditional on the decided state, and audit rows
 * carry ids only.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
}));

const state = {
  isAdmin: true,
  signedIn: true,
  membership: null as null | {
    id: string;
    organization_id: string;
    user_id: string;
    role: "owner" | "member";
    status: "invited" | "active" | "disabled";
  },
  otherOwners: 1,
  updateMatches: true,
};
const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      getUser: async () =>
        state.signedIn
          ? {
              data: {
                user: {
                  id: "admin-1",
                  email: "admin@example.test",
                  app_metadata: { password_set: true },
                },
              },
              error: null,
            }
          : { data: { user: null }, error: null },
    },
    rpc: async () => ({ data: state.isAdmin, error: null }),
  }),
}));

const updates: FakeQuery[] = [];
function resolve(query: FakeQuery) {
  if (query.table !== "organization_memberships") return { data: null, error: null };
  if (query.op === "select" && findFilter(query, "id"))
    return { data: state.membership, error: null };
  if (query.op === "select" && findFilter(query, "role")?.value === "owner") {
    return {
      data: Array.from({ length: state.otherOwners }, (_, i) => ({ id: `owner-${i}` })),
      error: null,
    };
  }
  if (query.op === "update") {
    updates.push(query);
    return {
      data: state.updateMatches ? { id: findFilter(query, "id")?.value } : null,
      error: null,
    };
  }
  return { data: null, error: null };
}
const fake = createFakeSupabase(resolve);
const createAdminSupabase = vi.fn(() => fake.client);
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase }));

const { changeMembershipRoleAction, setMembershipStatusAction } =
  await import("@/server/actions/memberships");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP = "33333333-3333-4333-8333-333333333333";
const idle = { status: "idle" } as const;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}
const roleForm = (role: string, organizationId = ORG) =>
  form({ organizationId, membershipId: MEMBERSHIP, role });
const statusForm = (action: string, organizationId = ORG) =>
  form({ organizationId, membershipId: MEMBERSHIP, action });

beforeEach(() => {
  state.isAdmin = true;
  state.signedIn = true;
  state.membership = {
    id: MEMBERSHIP,
    organization_id: ORG,
    user_id: "user-9",
    role: "member",
    status: "active",
  };
  state.otherOwners = 1;
  state.updateMatches = true;
  updates.length = 0;
  fake.queries.length = 0;
  createAdminSupabase.mockClear();
  recordAuditEvent.mockClear();
});

describe("authorization", () => {
  it("refuses an ordinary member before touching the service role", async () => {
    state.isAdmin = false;
    const role = await changeMembershipRoleAction(idle, roleForm("owner"));
    const status = await setMembershipStatusAction(idle, statusForm("deactivate"));
    expect(role).toMatchObject({ status: "error", message: /Platform admin privileges/ });
    expect(status).toMatchObject({ status: "error", message: /Platform admin privileges/ });
    expect(createAdminSupabase).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("redirects signed-out callers to login before anything else", async () => {
    state.signedIn = false;
    await expect(changeMembershipRoleAction(idle, roleForm("owner"))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("validates ids and values before any service-role call", async () => {
    expect(
      await changeMembershipRoleAction(
        idle,
        form({ organizationId: ORG, membershipId: "x", role: "owner" }),
      ),
    ).toMatchObject({
      status: "error",
      fieldErrors: { membershipId: expect.any(Array) },
    });
    expect(await changeMembershipRoleAction(idle, roleForm("superuser"))).toMatchObject({
      status: "error",
      fieldErrors: { role: expect.any(Array) },
    });
    expect(await setMembershipStatusAction(idle, statusForm("delete"))).toMatchObject({
      status: "error",
      fieldErrors: { action: expect.any(Array) },
    });
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("uses the same copy when the membership belongs to another organization or is missing", async () => {
    const mismatch = await changeMembershipRoleAction(idle, roleForm("owner", OTHER_ORG));
    state.membership = null;
    const missing = await setMembershipStatusAction(idle, statusForm("deactivate"));
    expect(mismatch).toMatchObject({
      status: "error",
      message: "This membership no longer exists.",
    });
    expect(missing).toMatchObject({
      status: "error",
      message: "This membership no longer exists.",
    });
    expect(updates).toHaveLength(0);
  });
});

describe("changeMembershipRoleAction", () => {
  it("promotes an active member to owner with a conditional write and an ids-only audit", async () => {
    const result = await changeMembershipRoleAction(idle, roleForm("owner"));
    expect(result).toMatchObject({ status: "success", message: "Role updated to Owner." });
    const update = updates[0]!;
    expect(update.values).toEqual({ role: "owner" });
    expect(findFilter(update, "organization_id")?.value).toBe(ORG);
    expect(findFilter(update, "status")?.value).toBe("active");
    expect(findFilter(update, "role")?.value).toBe("member");
    expect(recordAuditEvent).toHaveBeenCalledWith("membership.role_changed", {
      organizationId: ORG,
      targetType: "membership",
      targetId: MEMBERSHIP,
      metadata: { user_id: "user-9", from: "member", to: "owner" },
    });
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toContain("@");
  });

  it("demotes an owner only when another active owner remains", async () => {
    state.membership!.role = "owner";
    state.otherOwners = 0;
    const refused = await changeMembershipRoleAction(idle, roleForm("member"));
    expect(refused).toMatchObject({ status: "error", message: /at least one active owner/ });
    expect(updates).toHaveLength(0);
    expect(recordAuditEvent).not.toHaveBeenCalled();

    state.otherOwners = 1;
    const allowed = await changeMembershipRoleAction(idle, roleForm("member"));
    expect(allowed).toMatchObject({ status: "success", message: "Role updated to Member." });
    expect(updates).toHaveLength(1);
  });

  it("is a no-op when the role is already set and refuses non-active memberships", async () => {
    expect(await changeMembershipRoleAction(idle, roleForm("member"))).toMatchObject({
      status: "success",
      message: /No change/,
    });
    state.membership!.status = "invited";
    expect(await changeMembershipRoleAction(idle, roleForm("owner"))).toMatchObject({
      status: "error",
      message: /Only active members/,
    });
    expect(updates).toHaveLength(0);
  });

  it("reports a concurrent change instead of applying a stale decision", async () => {
    state.updateMatches = false;
    const result = await changeMembershipRoleAction(idle, roleForm("owner"));
    expect(result).toMatchObject({ status: "error", message: /changed meanwhile/ });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("setMembershipStatusAction", () => {
  it("deactivates an active member with a conditional write and audits", async () => {
    const result = await setMembershipStatusAction(idle, statusForm("deactivate"));
    expect(result).toMatchObject({ status: "success", message: /no longer has access/ });
    const update = updates[0]!;
    expect(update.values).toEqual({ status: "disabled" });
    expect(findFilter(update, "status")?.value).toBe("active");
    expect(findFilter(update, "organization_id")?.value).toBe(ORG);
    expect(recordAuditEvent).toHaveBeenCalledWith("membership.deactivated", {
      organizationId: ORG,
      targetType: "membership",
      targetId: MEMBERSHIP,
      metadata: { user_id: "user-9", role: "member" },
    });
  });

  it("refuses to deactivate the last active owner", async () => {
    state.membership!.role = "owner";
    state.otherOwners = 0;
    const result = await setMembershipStatusAction(idle, statusForm("deactivate"));
    expect(result).toMatchObject({ status: "error", message: /at least one active owner/ });
    expect(updates).toHaveLength(0);
  });

  it("refuses to deactivate a pending invitation or an already deactivated membership", async () => {
    state.membership!.status = "invited";
    expect(await setMembershipStatusAction(idle, statusForm("deactivate"))).toMatchObject({
      status: "error",
      message: /Pending invitations cannot be deactivated/,
    });
    state.membership!.status = "disabled";
    expect(await setMembershipStatusAction(idle, statusForm("deactivate"))).toMatchObject({
      status: "error",
      message: /already deactivated/,
    });
    expect(updates).toHaveLength(0);
  });

  it("reactivates only a deactivated membership", async () => {
    expect(await setMembershipStatusAction(idle, statusForm("reactivate"))).toMatchObject({
      status: "error",
      message: /Only deactivated memberships/,
    });
    state.membership!.status = "disabled";
    const result = await setMembershipStatusAction(idle, statusForm("reactivate"));
    expect(result).toMatchObject({ status: "success", message: "Membership reactivated." });
    const update = updates[0]!;
    expect(update.values).toEqual({ status: "active" });
    expect(findFilter(update, "status")?.value).toBe("disabled");
    expect(recordAuditEvent).toHaveBeenCalledWith("membership.reactivated", expect.any(Object));
  });
});
