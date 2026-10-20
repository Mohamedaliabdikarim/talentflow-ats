/**
 * GitHub profile URL → exact login (ADR-038). Pure. The candidate's stored `github_url` is the
 * only input; this never searches, normalises typos or guesses an alternative account. Anything
 * other than `https://github.com/<login>` (optionally `www.`, optional trailing slash) yields
 * null and the analysis proceeds without GitHub evidence.
 */

// GitHub logins: 1-39 alphanumeric characters or hyphens, no leading/trailing hyphen.
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export type GithubProfile = {
  /** The login exactly as written in the URL (GitHub logins are case-insensitive). */
  login: string;
  /** Canonical profile URL rendered to reviewers. */
  profileUrl: string;
};

export function parseGithubProfileUrl(value: string | null | undefined): GithubProfile | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  if (url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") {
    return null;
  }
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 1) return null;
  const login = segments[0]!;
  if (!LOGIN_PATTERN.test(login)) return null;
  return { login, profileUrl: `https://github.com/${login}` };
}

/** True when two logins name the same account (GitHub treats logins case-insensitively). */
export function sameGithubLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
