import { describe, expect, it } from "vitest";
import { buildInviteUrl, redactInviteUrl } from "@/lib/invite";
import { resolveLandingPath } from "@/lib/landing";

describe("buildInviteUrl", () => {
  it("points at the confirm route with token, type and next path", () => {
    const url = new URL(
      buildInviteUrl("https://app.example.com", "abc123", "invite", "/auth/set-password"),
    );
    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("invite");
    expect(url.searchParams.get("next")).toBe("/auth/set-password");
  });

  it("encodes unsafe characters in the token", () => {
    const url = buildInviteUrl("http://localhost:3000", "a b&c", "magiclink", "/");
    expect(url).toContain("token_hash=a+b%26c");
  });
});

describe("redactInviteUrl", () => {
  it("masks the token value but keeps the rest of the URL readable", () => {
    const url = buildInviteUrl("http://localhost:3000", "secret-token", "invite", "/x");
    const redacted = redactInviteUrl(url);
    expect(redacted).not.toContain("secret-token");
    expect(redacted).toContain("token_hash=[redacted]");
    expect(redacted).toContain("type=invite");
  });

  it("redacts every occurrence inside a longer message", () => {
    const message = "first ?token_hash=aaa&x=1 second token_hash=bbb";
    expect(redactInviteUrl(message)).toBe(
      "first ?token_hash=[redacted]&x=1 second token_hash=[redacted]",
    );
  });
});

describe("resolveLandingPath", () => {
  it("sends platform admins to the admin area even when they are members elsewhere", () => {
    expect(resolveLandingPath({ isPlatformAdmin: true, organizationSlugs: ["acme"] })).toBe(
      "/admin",
    );
  });

  it("opens the single workspace directly", () => {
    expect(resolveLandingPath({ isPlatformAdmin: false, organizationSlugs: ["acme"] })).toBe(
      "/o/acme",
    );
  });

  it("offers a chooser for several workspaces and a no-access page for none", () => {
    expect(resolveLandingPath({ isPlatformAdmin: false, organizationSlugs: ["a", "b"] })).toBe(
      "/workspaces",
    );
    expect(resolveLandingPath({ isPlatformAdmin: false, organizationSlugs: [] })).toBe(
      "/no-access",
    );
  });
});
