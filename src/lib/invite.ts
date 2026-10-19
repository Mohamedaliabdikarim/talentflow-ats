/**
 * One-time invitation links (ADR-007).
 *
 * The link is built from the `hashed_token` that Supabase's admin API returns for an
 * invite or magic link. Our /auth/confirm route exchanges it with `verifyOtp`, which
 * works for links generated server-side (the PKCE action link would not, because the
 * code verifier lives in the browser that started the flow). The token is single-use
 * and expires according to the project's "Email OTP expiration" setting.
 */

export type InviteLinkType = "invite" | "magiclink";

const TOKEN_PATTERN = /(token_hash=)[^&\s"']+/gi;

export function buildInviteUrl(
  appUrl: string,
  tokenHash: string,
  type: InviteLinkType,
  next: string,
): string {
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

/** Replaces token values so a URL or message can be logged or shown in an audit trail. */
export function redactInviteUrl(value: string): string {
  return value.replace(TOKEN_PATTERN, "$1[redacted]");
}
