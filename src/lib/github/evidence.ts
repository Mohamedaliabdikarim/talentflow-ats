import "server-only";
import { sameGithubLogin } from "@/lib/github/profile";

/**
 * Public GitHub evidence for one exact login through the official REST API (ADR-038,
 * docs/AI_INSIGHTS.md §8). Bounded, best-effort and side-effect free: any failure is returned as
 * a status the run records and the UI explains; nothing here throws for API problems, logs
 * content, or calls a search endpoint. Everything returned is untrusted text for the prompt
 * builder to neutralise.
 */

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_MAX_REPOSITORIES = 8;
export const GITHUB_MAX_READMES = 5;
export const GITHUB_README_MAX_CHARS = 2_500;
/** Per-request timeout; a profile with many repositories still finishes well under a minute. */
export const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

export type GithubRepositoryEvidence = {
  name: string;
  url: string;
  description: string | null;
  /** Language names ordered by bytes of code, no percentages (they read as proficiency). */
  languages: string[];
  topics: string[];
  pushedAt: string | null;
  readmeExcerpt: string | null;
};

export type GithubEvidenceStatus = "included" | "not_found" | "rate_limited" | "unavailable";

export type GithubEvidence =
  | {
      status: "included";
      login: string;
      profileUrl: string;
      repositories: GithubRepositoryEvidence[];
      fetchedAt: string;
    }
  | { status: Exclude<GithubEvidenceStatus, "included">; login: string; message: string };

export type FetchGithubEvidenceOptions = {
  /** Optional fine-grained token with public read access; raises the rate limit. */
  token?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  maxRepositories?: number;
  maxReadmes?: number;
};

type ApiOutcome =
  | { ok: true; status: number; json: () => Promise<unknown>; text: () => Promise<string> }
  | { ok: false; kind: "not_found" | "rate_limited" | "unavailable"; message: string };

class GithubClient {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly token: string | undefined,
    private readonly signal: AbortSignal | undefined,
  ) {}

  async get(path: string, accept = "application/vnd.github+json"): Promise<ApiOutcome> {
    const headers: Record<string, string> = {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "talentflow-ats",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const signals = [AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)];
    if (this.signal) signals.push(this.signal);
    let response: Response;
    try {
      response = await this.fetchImpl(`${GITHUB_API_BASE}${path}`, {
        method: "GET",
        headers,
        signal: AbortSignal.any(signals),
        cache: "no-store",
      });
    } catch {
      return { ok: false, kind: "unavailable", message: "GitHub could not be reached." };
    }
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        json: () => response.json(),
        text: () => response.text(),
      };
    }
    if (response.status === 404) {
      return { ok: false, kind: "not_found", message: "GitHub returned not found." };
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && remaining === "0")) {
      return {
        ok: false,
        kind: "rate_limited",
        message: "The GitHub API rate limit was reached. Try again later.",
      };
    }
    return {
      ok: false,
      kind: "unavailable",
      message: `GitHub answered with status ${response.status}.`,
    };
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Fetches the profile, its owned (non-fork) repositories, their languages and README excerpts.
 * The profile request must answer with the same login (case-insensitively); a renamed or
 * redirected account is reported as not found rather than silently substituted.
 */
export async function fetchGithubEvidence(
  login: string,
  options: FetchGithubEvidenceOptions = {},
): Promise<GithubEvidence> {
  const client = new GithubClient(options.fetchImpl ?? fetch, options.token, options.signal);
  const maxRepositories = options.maxRepositories ?? GITHUB_MAX_REPOSITORIES;
  const maxReadmes = options.maxReadmes ?? GITHUB_MAX_READMES;

  const profile = await client.get(`/users/${encodeURIComponent(login)}`);
  if (!profile.ok) return { status: profile.kind, login, message: profile.message };
  const profileJson = (await profile.json().catch(() => null)) as Record<string, unknown> | null;
  const answeredLogin = asString(profileJson?.login);
  if (!answeredLogin || !sameGithubLogin(answeredLogin, login)) {
    return {
      status: "not_found",
      login,
      message: "The GitHub account at this URL does not match the provided login.",
    };
  }
  const profileUrl = asString(profileJson?.html_url) ?? `https://github.com/${login}`;

  const repos = await client.get(
    `/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&direction=desc&per_page=50`,
  );
  if (!repos.ok) return { status: repos.kind, login, message: repos.message };
  const reposJson = (await repos.json().catch(() => [])) as unknown;
  const owned = (Array.isArray(reposJson) ? reposJson : [])
    .filter(
      (repo): repo is Record<string, unknown> =>
        typeof repo === "object" && repo !== null && (repo as { fork?: unknown }).fork !== true,
    )
    .slice(0, maxRepositories);

  const repositories: GithubRepositoryEvidence[] = [];
  for (const [index, repo] of owned.entries()) {
    const name = asString(repo.name);
    if (!name) continue;
    const url = asString(repo.html_url) ?? `https://github.com/${login}/${name}`;

    let languages: string[] = [];
    const languagesResult = await client.get(
      `/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}/languages`,
    );
    if (languagesResult.ok) {
      const json = (await languagesResult.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (json && typeof json === "object") {
        languages = Object.entries(json)
          .filter(([, bytes]) => typeof bytes === "number")
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .map(([language]) => language);
      }
    }

    let readmeExcerpt: string | null = null;
    if (index < maxReadmes) {
      const readme = await client.get(
        `/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}/readme`,
        "application/vnd.github.raw+json",
      );
      if (readme.ok) {
        const text = (await readme.text().catch(() => "")).replace(/\u0000/g, "").trim();
        readmeExcerpt = text.length > 0 ? text.slice(0, GITHUB_README_MAX_CHARS) : null;
      }
    }

    const topics = Array.isArray(repo.topics)
      ? repo.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 10)
      : [];

    repositories.push({
      name,
      url,
      description: asString(repo.description),
      languages,
      topics,
      pushedAt: asString(repo.pushed_at),
      readmeExcerpt,
    });
  }

  return {
    status: "included",
    login: answeredLogin,
    profileUrl,
    repositories,
    fetchedAt: new Date().toISOString(),
  };
}
