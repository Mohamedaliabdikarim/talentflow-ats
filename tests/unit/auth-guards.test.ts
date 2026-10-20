import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side guard behaviour with a fake Supabase client. The database policies
 * themselves are covered by tests/db; these tests prove the application layer fails
 * closed and never distinguishes "hidden by RLS" from "does not exist".
 */

vi.mock("server-only", () => ({}));

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
  unstable_rethrow: () => {},
}));

type FakeOptions = {
  user?: { id: string; email: string } | null;
  isAdmin?: boolean;
  passwordSet?: boolean;
  organization?: { id: string; name: string; slug: string; status: string } | null;
  membershipRole?: string | null;
};

const fake: FakeOptions = {};

function queryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      if (table === "organizations") return { data: fake.organization ?? null, error: null };
      if (table === "organization_memberships") {
        return {
          data: fake.membershipRole ? { role: fake.membershipRole } : null,
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      getUser: async () =>
        fake.user
          ? {
              data: {
                user: { ...fake.user, app_metadata: { password_set: fake.passwordSet ?? true } },
              },
              error: null,
            }
          : { data: { user: null }, error: null },
    },
    rpc: async (name: string) => {
      if (name === "is_platform_admin") return { data: fake.isAdmin ?? false, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => queryBuilder(table),
  }),
}));

const { getOrganizationContext, requireOrgAccess, requirePlatformAdmin, requireUser } =
  await import("@/server/auth");

const alice = { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.test" };
const aliceResolved = { ...alice, passwordSet: true };
const acme = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Acme",
  slug: "acme",
  status: "active",
};

beforeEach(() => {
  fake.user = alice;
  fake.isAdmin = false;
  fake.passwordSet = true;
  fake.organization = acme;
  fake.membershipRole = "member";
  redirectMock.mockClear();
});

describe("requireUser", () => {
  it("redirects signed-out callers to the login page with the return path", async () => {
    fake.user = null;
    await expect(requireUser("/o/acme/jobs")).rejects.toThrow(
      "REDIRECT:/login?next=%2Fo%2Facme%2Fjobs",
    );
  });

  it("returns the verified user when signed in and a password is established", async () => {
    await expect(requireUser()).resolves.toEqual(aliceResolved);
  });

  it("routes a signed-in user who has not set a password to the set-password page", async () => {
    fake.passwordSet = false;
    await expect(requireUser("/admin")).rejects.toThrow("REDIRECT:/auth/set-password");
  });

  it("lets the set-password page itself load for a user without a password", async () => {
    fake.passwordSet = false;
    await expect(
      requireUser("/auth/set-password", { allowWithoutPassword: true }),
    ).resolves.toEqual({ ...alice, passwordSet: false });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("checks the session before the password, so signed-out still goes to login", async () => {
    fake.user = null;
    fake.passwordSet = false;
    await expect(requireUser("/admin")).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
  });
});

describe("requirePlatformAdmin", () => {
  it("rejects members who are not platform admins", async () => {
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  it("accepts platform admins", async () => {
    fake.isAdmin = true;
    await expect(requirePlatformAdmin()).resolves.toEqual(aliceResolved);
  });

  it("sends a platform admin without an established password to set-password first", async () => {
    // An invited admin on a verified session but no password must not reach admin actions.
    fake.isAdmin = true;
    fake.passwordSet = false;
    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/auth/set-password");
  });
});

describe("getOrganizationContext", () => {
  it("returns null when RLS hides the organization", async () => {
    fake.organization = null;
    await expect(getOrganizationContext("other")).resolves.toBeNull();
  });

  it("returns null for a non-member who is not a platform admin", async () => {
    fake.membershipRole = null;
    await expect(getOrganizationContext("acme")).resolves.toBeNull();
  });

  it("marks platform admins without membership as acting as admin", async () => {
    fake.isAdmin = true;
    fake.membershipRole = null;
    await expect(getOrganizationContext("acme")).resolves.toMatchObject({
      slug: "acme",
      role: null,
      isPlatformAdmin: true,
      actingAsAdmin: true,
    });
  });

  it("does not flag admins who are also genuine members", async () => {
    fake.isAdmin = true;
    fake.membershipRole = "owner";
    await expect(getOrganizationContext("acme")).resolves.toMatchObject({
      role: "owner",
      actingAsAdmin: false,
    });
  });
});

describe("requireOrgAccess", () => {
  it("throws an authorization error instead of leaking existence", async () => {
    fake.membershipRole = null;
    await expect(requireOrgAccess("acme")).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  it("routes a member without an established password to set-password first", async () => {
    fake.passwordSet = false;
    await expect(requireOrgAccess("acme")).rejects.toThrow("REDIRECT:/auth/set-password");
  });
});
