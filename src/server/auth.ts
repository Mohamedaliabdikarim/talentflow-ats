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

export type CurrentUser = { id: string; email: string };

export type OrganizationContext = {
  id: string;
  name: string;
  slug: string;
  status: Enums<"organization_status">;
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
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** Redirects to the login page (remembering the current path) when signed out. */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
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
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("id, name, slug, status")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`Could not load organization: ${error.message}`);
    if (!organization) return null;

    const [admin, membership] = await Promise.all([
      isPlatformAdmin(),
      supabase
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", organization.id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    const role = membership.data?.role ?? null;
    if (!admin && role === null) return null;

    return {
      ...organization,
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
