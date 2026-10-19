import { describe, expect, it } from "vitest";
import {
  APPLICATION_STAGES,
  applicationStageSchema,
  pipelineFiltersSchema,
} from "@/lib/validation/application";
import { loginSchema, passwordSchema, safeRedirectPath } from "@/lib/validation/auth";
import {
  candidateInputSchema,
  githubUrlSchema,
  linkedinUrlSchema,
} from "@/lib/validation/candidate";
import { jobInputSchema } from "@/lib/validation/job";
import { organizationInputSchema, slugify } from "@/lib/validation/organization";

describe("linkedinUrlSchema", () => {
  it.each([
    "https://www.linkedin.com/in/ada-example",
    "https://linkedin.com/in/ada",
    "https://uk.linkedin.com/in/ada/",
    "  https://www.linkedin.com/in/ada?trk=x  ",
  ])("accepts a profile URL: %s", (url) => {
    expect(linkedinUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "http://www.linkedin.com/in/ada",
    "https://linkedin.com",
    "https://linkedin.com/",
    "https://evil.com/linkedin.com/in/ada",
    "https://linkedin.com.evil.com/in/ada",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (url) => {
    expect(linkedinUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("githubUrlSchema", () => {
  it.each(["https://github.com/octocat", "https://github.com/octo-cat/", "https://github.com/a"])(
    "accepts a profile URL: %s",
    (url) => {
      expect(githubUrlSchema.safeParse(url).success).toBe(true);
    },
  );

  it.each([
    "https://github.com/octocat/some-repo",
    "https://github.com/-octocat",
    "https://github.com/octocat-",
    "https://github.com/",
    "http://github.com/octocat",
    "https://gitlab.com/octocat",
    "https://github.com.evil.com/octocat",
  ])("rejects %s", (url) => {
    expect(githubUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("candidateInputSchema", () => {
  it("turns empty optional form fields into undefined", () => {
    const result = candidateInputSchema.parse({
      fullName: "  Ada Example ",
      email: "",
      phone: "   ",
      linkedinUrl: "",
      githubUrl: "",
      notes: "",
    });
    expect(result).toEqual({ fullName: "Ada Example" });
  });

  it("rejects an invalid email and a too-short name", () => {
    const result = candidateInputSchema.safeParse({ fullName: "A", email: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(expect.arrayContaining(["fullName", "email"]));
    }
  });
});

describe("jobInputSchema", () => {
  it("defaults status to open and description to empty", () => {
    expect(jobInputSchema.parse({ title: "Backend Engineer" })).toEqual({
      title: "Backend Engineer",
      description: "",
      status: "open",
    });
  });

  it("rejects unknown statuses", () => {
    expect(jobInputSchema.safeParse({ title: "x y", status: "archived" }).success).toBe(false);
  });
});

describe("organization slug", () => {
  it.each([
    ["Northwind Hiring AS", "northwind-hiring-as"],
    ["  Åsa & Co.  ", "asa-co"],
    ["---", ""],
    ["Acme", "acme"],
  ])("slugify(%j) -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("accepts a valid organization and lowercases the slug", () => {
    expect(organizationInputSchema.parse({ name: "Acme", slug: "ACME-Hiring" })).toEqual({
      name: "Acme",
      slug: "acme-hiring",
    });
  });

  it.each(["a", "-acme", "acme-", "ac--me", "acme hiring", "acme_hiring"])(
    "rejects slug %s",
    (slug) => {
      expect(organizationInputSchema.safeParse({ name: "Acme", slug }).success).toBe(false);
    },
  );
});

describe("application stages", () => {
  it("keeps the pipeline order the Kanban relies on", () => {
    expect(APPLICATION_STAGES).toEqual([
      "new",
      "screening",
      "interview",
      "offer",
      "hired",
      "rejected",
    ]);
  });

  it("rejects stages that do not exist in the database enum", () => {
    expect(applicationStageSchema.safeParse("archived").success).toBe(false);
  });

  it("parses URL filters and ignores a malformed job id", () => {
    expect(pipelineFiltersSchema.safeParse({ job: "not-a-uuid" }).success).toBe(false);
    expect(pipelineFiltersSchema.parse({ q: "  ada " })).toEqual({ q: "ada" });
  });
});

describe("auth helpers", () => {
  it("requires at least 10 characters for new passwords", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long-enough-1").success).toBe(true);
  });

  it("validates the login form", () => {
    expect(loginSchema.safeParse({ email: "x", password: "y" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "y" }).success).toBe(true);
  });

  it.each([
    ["/o/acme/jobs", "/o/acme/jobs"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["", "/"],
    [undefined, "/"],
    [42, "/"],
  ])("safeRedirectPath(%j) -> %j", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
