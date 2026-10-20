import { describe, expect, it } from "vitest";
import { parseGithubProfileUrl, sameGithubLogin } from "@/lib/github/profile";

/**
 * Exact-profile rule (ADR-038 §8.1): only `https://github.com/<login>` yields a login; nothing
 * is normalised, guessed or searched.
 */

describe("parseGithubProfileUrl", () => {
  it("accepts a profile URL, with or without a trailing slash or www", () => {
    expect(parseGithubProfileUrl("https://github.com/octocat")).toEqual({
      login: "octocat",
      profileUrl: "https://github.com/octocat",
    });
    expect(parseGithubProfileUrl("https://github.com/octo-cat/")?.login).toBe("octo-cat");
    expect(parseGithubProfileUrl("https://www.github.com/Octocat")?.login).toBe("Octocat");
    expect(parseGithubProfileUrl("  https://github.com/octocat  ")?.login).toBe("octocat");
  });

  it("keeps the login exactly as written (no case folding, no correction)", () => {
    expect(parseGithubProfileUrl("https://github.com/OctoCat")?.login).toBe("OctoCat");
  });

  it.each([
    ["repository path", "https://github.com/octocat/hello-world"],
    ["organization sub-path", "https://github.com/orgs/github/people"],
    ["query string", "https://github.com/octocat?tab=repositories"],
    ["fragment", "https://github.com/octocat#readme"],
    ["http scheme", "http://github.com/octocat"],
    ["other host", "https://gitlab.com/octocat"],
    ["lookalike host", "https://github.com.evil.test/octocat"],
    ["credentials", "https://user:pw@github.com/octocat"],
    ["leading hyphen", "https://github.com/-octocat"],
    ["too long", `https://github.com/${"a".repeat(40)}`],
    ["empty path", "https://github.com/"],
    ["not a url", "octocat"],
  ])("rejects %s", (_label, value) => {
    expect(parseGithubProfileUrl(value)).toBeNull();
  });

  it("returns null for missing values", () => {
    expect(parseGithubProfileUrl(null)).toBeNull();
    expect(parseGithubProfileUrl(undefined)).toBeNull();
    expect(parseGithubProfileUrl("")).toBeNull();
  });
});

describe("sameGithubLogin", () => {
  it("compares logins case-insensitively and nothing more", () => {
    expect(sameGithubLogin("OctoCat", "octocat")).toBe(true);
    expect(sameGithubLogin("octocat", "octocat2")).toBe(false);
    expect(sameGithubLogin("octo-cat", "octocat")).toBe(false);
  });
});
