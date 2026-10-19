import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

/**
 * Supabase client bound to the current request's session cookies.
 * Uses the anon key, so every query is subject to row level security.
 * This is the default client for Server Components, Server Actions and route handlers.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. Session refresh happens in src/proxy.ts,
          // so swallowing the error here is safe.
        }
      },
    },
  });
}
