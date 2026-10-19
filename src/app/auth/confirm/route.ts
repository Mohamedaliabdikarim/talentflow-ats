import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation/auth";

/**
 * Exchanges a one-time token hash (invitation or magic link) for a session.
 * The token is consumed server-side; nothing about it is logged. Invalid or used tokens
 * send the visitor to the login page with a generic, non-revealing message.
 */
const ALLOWED_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "invite",
  "magiclink",
  "recovery",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/app");

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=expired_link", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
