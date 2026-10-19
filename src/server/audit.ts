import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";

export type AuditAction =
  | "organization.created"
  | "user.invited"
  | "admin.granted"
  | "admin.context_entered"
  | "membership.activated"
  | "auth.signed_in"
  | "auth.signed_out";

export type AuditDetails = {
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Must not contain personal data (names, emails) or tokens. Identifiers only. */
  metadata?: Record<string, Json>;
};

/**
 * Records a security-relevant action through `log_audit_event`, so the actor is always the
 * authenticated user (taken from auth.uid() in the database, never from the caller).
 * Best-effort: a failed audit write is logged and does not undo the action, because the
 * action and the audit row cannot share a transaction across the Auth API and PostgreSQL.
 */
export async function recordAuditEvent(action: AuditAction, details: AuditDetails = {}) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("log_audit_event", {
    p_action: action,
    p_organization_id: details.organizationId ?? undefined,
    p_target_type: details.targetType,
    p_target_id: details.targetId,
    p_metadata: details.metadata ?? {},
  });
  if (error) {
    console.error(`[audit] failed to record ${action}: ${error.message}`);
  }
}
