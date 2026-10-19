import { afterEach, describe, expect, it, vi } from "vitest";
import { isPreviewEnabled } from "@/preview/enabled";

/** The preview must be unreachable in production unless explicitly switched on. */

afterEach(() => vi.unstubAllEnvs());

describe("isPreviewEnabled", () => {
  it("is on outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TALENTFLOW_PREVIEW", "");
    expect(isPreviewEnabled()).toBe(true);
  });

  it("is off in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TALENTFLOW_PREVIEW", "");
    expect(isPreviewEnabled()).toBe(false);
  });

  it("is on in production only with the explicit flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TALENTFLOW_PREVIEW", "1");
    expect(isPreviewEnabled()).toBe(true);
    vi.stubEnv("TALENTFLOW_PREVIEW", "true");
    expect(isPreviewEnabled()).toBe(false);
  });
});
