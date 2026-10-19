import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client. It bypasses row level security, so it must only be used by
 * provisioning code paths that have already verified the caller is a platform admin
 * through the user-scoped client (docs/SECURITY.md §4). Never pass it to the browser,
 * never use it for ordinary tenant reads or writes.
 */
export function createAdminSupabase() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
