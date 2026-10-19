import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client for client components (for example auth state listeners).
 * Uses the anon key only; RLS applies to every query it makes.
 */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are not configured");
  }
  return createBrowserClient(url, anonKey);
}
