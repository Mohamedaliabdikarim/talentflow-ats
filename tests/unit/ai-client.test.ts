import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Azure OpenAI client config and error mapping (ADR-034). Pure checks only — no network.
 * The real end-to-end call is verified by `pnpm ai:smoke`, which is not run in CI.
 */

vi.mock("server-only", () => ({}));

const { AiError, buildAzureBaseUrl, getAzureOpenAIConfig, isAzureOpenAIConfigured, mapAiError } =
  await import("@/lib/ai/client");

const REQUIRED_BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const AZURE_ENV = {
  AZURE_OPENAI_ENDPOINT: "https://my-resource.openai.azure.com",
  AZURE_OPENAI_API_KEY: "azure-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
};
const MANAGED_KEYS = [
  ...Object.keys(REQUIRED_BASE_ENV),
  ...Object.keys(AZURE_ENV),
  "AZURE_OPENAI_API_VERSION",
];

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of MANAGED_KEYS) saved[key] = process.env[key];
  for (const [key, value] of Object.entries({ ...REQUIRED_BASE_ENV, ...AZURE_ENV })) {
    process.env[key] = value;
  }
  delete process.env.AZURE_OPENAI_API_VERSION;
});
afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("buildAzureBaseUrl", () => {
  it("appends /openai/v1 to a bare resource endpoint", () => {
    expect(buildAzureBaseUrl("https://x.openai.azure.com")).toBe(
      "https://x.openai.azure.com/openai/v1",
    );
  });
  it("tolerates a trailing slash", () => {
    expect(buildAzureBaseUrl("https://x.openai.azure.com/")).toBe(
      "https://x.openai.azure.com/openai/v1",
    );
  });
  it("does not double up when the endpoint already ends in /openai/v1", () => {
    expect(buildAzureBaseUrl("https://x.openai.azure.com/openai/v1")).toBe(
      "https://x.openai.azure.com/openai/v1",
    );
    expect(buildAzureBaseUrl("https://x.openai.azure.com/openai/v1/")).toBe(
      "https://x.openai.azure.com/openai/v1",
    );
  });
});

describe("getAzureOpenAIConfig", () => {
  it("returns the configuration when all Azure variables are present", () => {
    expect(getAzureOpenAIConfig()).toEqual({
      endpoint: AZURE_ENV.AZURE_OPENAI_ENDPOINT,
      apiKey: AZURE_ENV.AZURE_OPENAI_API_KEY,
      deployment: AZURE_ENV.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: undefined,
    });
    expect(isAzureOpenAIConfigured()).toBe(true);
  });

  it("throws a clear, key-free error naming each missing variable", () => {
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    try {
      getAzureOpenAIConfig();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      const message = (error as Error).message;
      expect(message).toContain("AZURE_OPENAI_API_KEY");
      expect(message).toContain("AZURE_OPENAI_DEPLOYMENT");
      expect(message).not.toContain("azure-key"); // never echoes a value
    }
    expect(isAzureOpenAIConfigured()).toBe(false);
  });
});

describe("mapAiError", () => {
  it("passes an AiError through unchanged", () => {
    const original = new AiError("rate_limit", "slow down");
    expect(mapAiError(original)).toBe(original);
  });
  it("maps an unknown error to a safe AiError", () => {
    const mapped = mapAiError(new Error("boom with secret-ish text"));
    expect(mapped).toBeInstanceOf(AiError);
    expect(mapped.kind).toBe("unknown");
    expect(mapped.message).not.toContain("secret-ish");
  });
});
