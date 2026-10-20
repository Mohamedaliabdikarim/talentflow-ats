import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * Server-side authorization guards (docs/SECURITY.md §4, layer 2).
 *
 * Every guard reads through the user-scoped client, so the database (RLS) remains the
 * final authority: `isPlatformAdmin()` is a SQL function over the platform_admins table and
 * organization lookups only return rows the caller may see. Results are cached per request
 * with React `cache`, so layouts, pages and actions can call them freely.
 */

export type CurrentUser = {
  id: string;
  email: string;
  /**
   * True once the user has established their own password through the set-password flow.
   * Backed by Supabase `app_metadata.password_set`, which only the service role can write
   * (src/server/actions/auth.ts), so a user cannot forge it. Invited/magic-link/recovery
   * sessions start without it, so they must set a password before reaching protected routes
   * (docs/SECURITY.md §3, ADR-030).
   */
  passwordSet: boolean;
};

export type OrganizationContext = {
  id: string;
  name: string;
  slug: string;
  status: Enums<"organization_status">;
  /** The caller's user id, used for created_by columns. */
  userId: string;
  /** Membership role, or null when the caller is a platform admin without membership. */
  role: Enums<"membership_role"> | null;
  isPlatformAdmin: boolean;
  /** True when access is granted by platform-admin authority rather than membership. */
  actingAsAdmin: boolean;
};

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Verified against the Auth server (not just the cookie). Null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  // app_metadata comes from the Auth server and cannot be set by the user; getUser()
  // returns the current value, so the flag reflects a completed set-password immediately.
  const passwordSet = data.user.app_metadata?.password_set === true;
  return { id: data.user.id, email: data.user.email ?? "", passwordSet };
});

export type RequireUserOptions = {
  /**
   * Allow a signed-in user who has not yet established a password. Only the set-password
   * page and its action pass this; every other protected route leaves it false so an
   * invited/magic-link/recovery session is sent to set a password first.
   */
  allowWithoutPassword?: boolean;
};

/**
 * Requires a signed-in user. Redirects to the login page when signed out, and to the
 * set-password page when the user has an active session but has never established a
 * password (ADR-030). The session is never revoked; the user is only routed.
 */
export async function requireUser(
  returnTo?: string,
  options: RequireUserOptions = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  if (!user.passwordSet && !options.allowWithoutPassword) {
    redirect("/auth/set-password");
  }
  return user;
}

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    // Fail closed: an unreadable authorization source must never grant access.
    throw new Error(`Could not verify platform admin status: ${error.message}`);
  }
  return data === true;
});

/** For Server Actions: throws AuthorizationError (converted to an error state by runAction). */
export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await isPlatformAdmin())) {
    throw new AuthorizationError("Platform admin privileges are required");
  }
  return user;
}

/** Active memberships of the current user with their organizations (RLS-filtered). */
export const getMyOrganizations = cache(
  async (): Promise<
    Array<{ id: string; name: string; slug: string; role: Enums<"membership_role"> }>
  > => {
    const user = await getCurrentUser();
    if (!user) return [];
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("organization_memberships")
      .select("role, organization:organizations(id, name, slug, status)")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (error) throw new Error(`Could not load memberships: ${error.message}`);
    return (data ?? [])
      .filter((row) => row.organization !== null && row.organization.status === "active")
      .map((row) => ({
        id: row.organization!.id,
        name: row.organization!.name,
        slug: row.organization!.slug,
        role: row.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
);

/**
 * Resolves an organization by slug for the current user. Returns null when the caller is
 * signed out, the organization does not exist, or RLS hides it; callers render a
 * permission-denied state for null and never distinguish "hidden" from "missing".
 */
export const getOrganizationContext = cache(
  async (slug: string): Promise<OrganizationContext | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    const supabase = await createServerSupabase();
    // One database round trip after the user check (ADR-042): the organization lookup (RLS
    // decides visibility), the platform-admin flag and the caller's active membership are
    // independent of each other. The membership is joined to the organization by slug
    // (`!inner`, so a non-matching slug yields no row) instead of waiting for the organization
    // id. The semantics are unchanged: the organization must be visible, and the caller must be
    // a platform admin or an active member.
    const [organizationResult, admin, membershipResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug, status")
        .eq("slug", slug)
        .maybeSingle(),
      isPlatformAdmin(),
      supabase
        .from("organization_memberships")
        .select("role, organizations!inner(id)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("organizations.slug", slug)
        .maybeSingle(),
    ]);
    if (organizationResult.error) {
      throw new Error(`Could not load organization: ${organizationResult.error.message}`);
    }
    const organization = organizationResult.data;
    if (!organization) return null;
    if (membershipResult.error) {
      throw new Error(`Could not load membership: ${membershipResult.error.message}`);
    }

    const role = membershipResult.data?.role ?? null;
    if (!admin && role === null) return null;

    return {
      ...organization,
      userId: user.id,
      role,
      isPlatformAdmin: admin,
      actingAsAdmin: admin && role === null,
    };
  },
);

/** For Server Actions inside a workspace: throws when the caller may not access the tenant. */
export async function requireOrgAccess(slug: string): Promise<OrganizationContext> {
  await requireUser();
  const context = await getOrganizationContext(slug);
  if (!context) throw new AuthorizationError("You do not have access to this organization");
  return context;
}
