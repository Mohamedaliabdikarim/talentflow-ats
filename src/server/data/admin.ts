import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";

/**
 * Read models for the platform-admin area. Everything goes through the user-scoped
 * client: a non-admin calling these simply gets empty results from RLS.
 */

export type OrganizationSummary = Pick<
  Tables<"organizations">,
  "id" | "name" | "slug" | "status" | "created_at"
> & { member_count: number };

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: Enums<"membership_role">;
  status: Enums<"membership_status">;
  createdAt: string;
};

export type AuditRow = {
  id: number;
  action: string;
  actorEmail: string | null;
  organizationName: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const supabase = await createServerSupabase();
  const [{ data: organizations, error }, { data: memberships }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("organization_memberships").select("organization_id").eq("status", "active"),
  ]);
  if (error) throw new Error(`Could not list organizations: ${error.message}`);
  const counts = new Map<string, number>();
  for (const membership of memberships ?? []) {
    counts.set(membership.organization_id, (counts.get(membership.organization_id) ?? 0) + 1);
  }
  return (organizations ?? []).map((organization) => ({
    ...organization,
    member_count: counts.get(organization.id) ?? 0,
  }));
}

export async function getOrganizationById(id: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load organization: ${error.message}`);
  return data;
}

/** Memberships joined with profiles in two queries (no FK between the tables). */
export async function listOrganizationMembers(organizationId: string): Promise<MemberRow[]> {
  const supabase = await createServerSupabase();
  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not list members: ${error.message}`);
  const profiles = await loadProfiles(memberships?.map((membership) => membership.user_id) ?? []);
  return (memberships ?? []).map((membership) => ({
    membershipId: membership.id,
    userId: membership.user_id,
    email: profiles.get(membership.user_id)?.email ?? "",
    fullName: profiles.get(membership.user_id)?.full_name ?? "",
    role: membership.role,
    status: membership.status,
    createdAt: membership.created_at,
  }));
}

export async function listPlatformAdmins() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id, granted_at, note")
    .order("granted_at", { ascending: true });
  if (error) throw new Error(`Could not list platform admins: ${error.message}`);
  const profiles = await loadProfiles(data?.map((row) => row.user_id) ?? []);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: profiles.get(row.user_id)?.email ?? "",
    fullName: profiles.get(row.user_id)?.full_name ?? "",
    grantedAt: row.granted_at,
    note: row.note,
  }));
}

export async function listAuditEvents(limit = 100): Promise<AuditRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, action, actor_user_id, organization_id, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list audit events: ${error.message}`);
  const rows = data ?? [];
  const actorIds = rows.map((row) => row.actor_user_id).filter((id): id is string => id !== null);
  const organizationIds = rows
    .map((row) => row.organization_id)
    .filter((id): id is string => id !== null);
  const [profiles, organizations] = await Promise.all([
    loadProfiles(actorIds),
    loadOrganizationNames(organizationIds),
  ]);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actor_user_id ? (profiles.get(row.actor_user_id)?.email ?? null) : null,
    organizationName: row.organization_id ? (organizations.get(row.organization_id) ?? null) : null,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
  }));
}

export async function getAdminOverview() {
  const supabase = await createServerSupabase();
  const [organizations, admins, members, recent] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("platform_admins").select("user_id", { count: "exact", head: true }),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    listAuditEvents(8),
  ]);
  return {
    organizationCount: organizations.count ?? 0,
    adminCount: admins.count ?? 0,
    activeMemberCount: members.count ?? 0,
    recentEvents: recent,
  };
}

async function loadProfiles(userIds: string[]) {
  const unique = [...new Set(userIds)];
  const map = new Map<string, { email: string; full_name: string }>();
  if (unique.length === 0) return map;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("profiles").select("id, email, full_name").in("id", unique);
  for (const profile of data ?? []) map.set(profile.id, profile);
  return map;
}

async function loadOrganizationNames(organizationIds: string[]) {
  const unique = [...new Set(organizationIds)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("organizations").select("id, name").in("id", unique);
  for (const organization of data ?? []) map.set(organization.id, organization.name);
  return map;
}
