import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provisioning actions must never reach the service-role client unless the caller is a
 * platform admin (spec §10: "Non-admin cannot invoke account-provisioning operations").
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

const state = { isAdmin: false, signedIn: true };
const createAdminSupabase = vi.fn();
const recordAuditEvent = vi.fn(async () => {});

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase }));
vi.mock("@/server/audit", () => ({ recordAuditEvent }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      getUser: async () =>
        state.signedIn
          ? {
              data: {
                // app_metadata.password_set: a fully onboarded admin; the set-password gate
                // (requireUser) is covered in tests/unit/auth-guards.test.ts.
                user: {
                  id: "u1",
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

const {
  createOrganizationAction,
  grantPlatformAdminAction,
  inviteUserAction,
  reissueInvitationAction,
} = await import("@/server/actions/admin");

const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

/** A service-role client whose membership lookup returns `membership`. */
function serviceWithMembership(
  membership: { id: string; organization_id: string; user_id: string; status: string } | null,
) {
  const generateLink = vi
    .fn()
    .mockResolvedValueOnce({
      data: { user: null, properties: null },
      error: { code: "email_exists", message: "exists" },
    })
    .mockResolvedValueOnce({
      data: {
        user: { id: "invited-user", last_sign_in_at: null },
        properties: { hashed_token: "tok-reissue" },
      },
      error: null,
    });
  const getUserById = vi.fn(async () => ({
    data: { user: { id: "invited-user", email: "pending@example.test" } },
    error: null,
  }));
  const insert = vi.fn(async () => ({ error: null }));
  return {
    client: {
      from: (table: string) => ({
        insert,
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "organization_memberships"
                ? { data: membership, error: null }
                : { data: null, error: null },
          }),
        }),
      }),
      auth: { admin: { generateLink, getUserById } },
    },
    insert,
    getUserById,
    generateLink,
  };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  state.isAdmin = false;
  state.signedIn = true;
  createAdminSupabase.mockReset();
  recordAuditEvent.mockClear();
});

describe("provisioning actions as a non-admin", () => {
  it("createOrganizationAction returns an authorization error without using the service role", async () => {
    const result = await createOrganizationAction({ status: "idle" }, form({ name: "Acme" }));
    expect(result).toEqual({ status: "error", message: "Platform admin privileges are required" });
    expect(createAdminSupabase).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("inviteUserAction and grantPlatformAdminAction behave the same", async () => {
    const invite = await inviteUserAction(
      { status: "idle" },
      form({ organizationId: "33333333-3333-4333-8333-333333333333", email: "x@example.test" }),
    );
    const grant = await grantPlatformAdminAction(
      { status: "idle" },
      form({ email: "x@example.test" }),
    );
    expect(invite.status).toBe("error");
    expect(grant.status).toBe("error");
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("reissueInvitationAction refuses a non-admin without touching the service role", async () => {
    const result = await reissueInvitationAction(
      { status: "idle" },
      form({ membershipId: MEMBERSHIP_ID }),
    );
    expect(result).toEqual({ status: "error", message: "Platform admin privileges are required" });
    expect(createAdminSupabase).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("signed-out callers are redirected to login before anything else happens", async () => {
    state.signedIn = false;
    await expect(
      createOrganizationAction({ status: "idle" }, form({ name: "Acme" })),
    ).rejects.toThrow("REDIRECT:/login");
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });
});

describe("createOrganizationAction as an admin", () => {
  it("validates input before touching the service role", async () => {
    state.isAdmin = true;
    const result = await createOrganizationAction({ status: "idle" }, form({ name: "A" }));
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors?.name).toBeDefined();
    }
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("derives the slug, inserts with the service role, audits, and redirects", async () => {
    state.isAdmin = true;
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "org-1", slug: "northwind-hiring" }, error: null }),
      }),
    }));
    createAdminSupabase.mockReturnValue({ from: () => ({ insert }) });

    await expect(
      createOrganizationAction({ status: "idle" }, form({ name: "Northwind Hiring" })),
    ).rejects.toThrow("REDIRECT:/admin/organizations/org-1");
    expect(insert).toHaveBeenCalledWith({
      name: "Northwind Hiring",
      slug: "northwind-hiring",
      created_by: "u1",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("organization.created", {
      organizationId: "org-1",
      targetType: "organization",
      targetId: "org-1",
    });
  });

  it("reports a duplicate slug as a field error", async () => {
    state.isAdmin = true;
    createAdminSupabase.mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }),
        }),
      }),
    });
    const result = await createOrganizationAction({ status: "idle" }, form({ name: "Acme" }));
    expect(result).toMatchObject({ status: "error", fieldErrors: { slug: expect.any(Array) } });
  });
});

describe("inviteUserAction as an admin", () => {
  it("creates an invite token for a new user and returns the link once", async () => {
    state.isAdmin = true;
    const generateLink = vi.fn(async () => ({
      data: { user: { id: "new-user" }, properties: { hashed_token: "tok-123" } },
      error: null,
    }));
    const insert = vi.fn(async () => ({ error: null }));
    createAdminSupabase.mockReturnValue({
      auth: { admin: { generateLink } },
      from: () => ({ insert }),
    });

    const result = await inviteUserAction(
      { status: "idle" },
      form({
        organizationId: "33333333-3333-4333-8333-333333333333",
        email: "new@example.test",
        role: "owner",
      }),
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.existingUser).toBe(false);
      expect(result.data.inviteUrl).toContain("/auth/confirm?token_hash=tok-123&type=invite");
    }
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "new-user", role: "owner", status: "invited" }),
    );
    // The audit metadata must not contain the email or the token.
    const auditCall = recordAuditEvent.mock.calls[0] as unknown[];
    expect(JSON.stringify(auditCall)).not.toContain("new@example.test");
    expect(JSON.stringify(auditCall)).not.toContain("tok-123");
  });

  it("adds existing users as active members with a magic link", async () => {
    state.isAdmin = true;
    const generateLink = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: null, properties: null },
        error: { code: "email_exists", message: "exists" },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: "old-user", last_sign_in_at: "2026-10-01T10:00:00Z" },
          properties: { hashed_token: "tok-magic" },
        },
        error: null,
      });
    const insert = vi.fn(async () => ({ error: null }));
    createAdminSupabase.mockReturnValue({
      auth: { admin: { generateLink } },
      from: () => ({ insert }),
    });

    const result = await inviteUserAction(
      { status: "idle" },
      form({ organizationId: "33333333-3333-4333-8333-333333333333", email: "old@example.test" }),
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.existingUser).toBe(true);
      expect(result.data.linkType).toBe("magiclink");
      expect(result.data.inviteUrl).toContain("next=%2F");
    }
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("keeps an account that never signed in as a pending invite", async () => {
    state.isAdmin = true;
    const generateLink = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: null, properties: null },
        error: { code: "email_exists", message: "exists" },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: "dormant-user", last_sign_in_at: null },
          properties: { hashed_token: "tok-again" },
        },
        error: null,
      });
    const insert = vi.fn(async () => ({ error: null }));
    createAdminSupabase.mockReturnValue({
      auth: { admin: { generateLink } },
      from: () => ({ insert }),
    });

    const result = await inviteUserAction(
      { status: "idle" },
      form({
        organizationId: "33333333-3333-4333-8333-333333333333",
        email: "dormant@example.test",
      }),
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.existingUser).toBe(false);
      expect(result.data.inviteUrl).toContain("next=%2Fauth%2Fset-password");
    }
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "invited" }));
  });
});

describe("reissueInvitationAction as an admin", () => {
  it("reissues a fresh link for a pending membership without creating or changing a membership", async () => {
    state.isAdmin = true;
    const { client, insert, getUserById } = serviceWithMembership({
      id: MEMBERSHIP_ID,
      organization_id: "33333333-3333-4333-8333-333333333333",
      user_id: "invited-user",
      status: "invited",
    });
    createAdminSupabase.mockReturnValue(client);

    const result = await reissueInvitationAction(
      { status: "idle" },
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.inviteUrl).toContain("token_hash=tok-reissue");
      expect(result.data.inviteUrl).toContain("next=%2Fauth%2Fset-password");
    }
    // No membership row is inserted or modified.
    expect(insert).not.toHaveBeenCalled();
    expect(getUserById).toHaveBeenCalledWith("invited-user");
    const auditCall = recordAuditEvent.mock.calls[0] as unknown[];
    expect(auditCall[0]).toBe("user.invite_reissued");
    // Audit metadata carries ids only, never the email or the token.
    expect(JSON.stringify(auditCall)).not.toContain("pending@example.test");
    expect(JSON.stringify(auditCall)).not.toContain("tok-reissue");
  });

  it("refuses to reissue for an already-active membership and writes no audit", async () => {
    state.isAdmin = true;
    const { client, insert } = serviceWithMembership({
      id: MEMBERSHIP_ID,
      organization_id: "33333333-3333-4333-8333-333333333333",
      user_id: "active-user",
      status: "active",
    });
    createAdminSupabase.mockReturnValue(client);

    const result = await reissueInvitationAction(
      { status: "idle" },
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("already active");
    }
    expect(insert).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a clear error when no membership matches", async () => {
    state.isAdmin = true;
    const { client } = serviceWithMembership(null);
    createAdminSupabase.mockReturnValue(client);

    const result = await reissueInvitationAction(
      { status: "idle" },
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "No invitation found for that member.",
    });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed membership id before any service-role call", async () => {
    state.isAdmin = true;
    const result = await reissueInvitationAction(
      { status: "idle" },
      form({ membershipId: "nope" }),
    );
    expect(result.status).toBe("error");
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });
});
