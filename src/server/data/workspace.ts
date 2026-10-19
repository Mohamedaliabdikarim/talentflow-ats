import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/server/audit";
import { getCurrentUser } from "@/server/auth";

/** Counts shown on the workspace overview. All RLS-scoped to the organization. */
export async function getWorkspaceCounts(organizationId: string) {
  const supabase = await createServerSupabase();
  const scoped = (table: "jobs" | "candidates" | "applications") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
  const [jobs, candidates, applications, members] = await Promise.all([
    scoped("jobs"),
    scoped("candidates"),
    scoped("applications"),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);
  return {
    jobs: jobs.count ?? 0,
    candidates: candidates.count ?? 0,
    applications: applications.count ?? 0,
    members: members.count ?? 0,
  };
}

const CONTEXT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Records that a platform admin entered a customer workspace (ADR-006). De-duplicated to
 * one event per admin, organization and hour so navigation inside the workspace does not
 * flood the log. Admins can read audit rows, which makes the lookup possible under RLS.
 */
export async function recordAdminContextEntry(organizationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createServerSupabase();
  const since = new Date(Date.now() - CONTEXT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("action", "admin.context_entered")
    .gte("created_at", since);
  if ((count ?? 0) > 0) return;
  await recordAuditEvent("admin.context_entered", {
    organizationId,
    targetType: "organization",
    targetId: organizationId,
  });
}
