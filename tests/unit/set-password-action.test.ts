import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

/**
 * setPasswordAction is where an invited/magic-link/recovery user establishes their own
 * password. It must mark the non-forgeable `app_metadata.password_set` flag through the
 * service role (so the set-password gate in requireUser cannot be skipped afterwards),
 * preserve the provider keys GoTrue keeps in app_metadata, record an audit event, and only
 * then continue. A failure to set the flag must surface as an error, not a silent success.
 * ADR-030.
 */

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
}));

const updateUser = vi.fn(async () => ({ error: null as { message: string } | null }));
const rpc = vi.fn(async () => ({ data: 0 as number | null, error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { updateUser }, rpc }),
}));

const getUserById = vi.fn(async () => ({
  data: { user: { app_metadata: { provider: "email", providers: ["email"] } } },
  error: null as { message: string } | null,
}));
const updateUserById = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ auth: { admin: { getUserById, updateUserById } } }),
}));

const recordAuditEvent = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ recordAuditEvent }));

class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "") {
    super(message);
    this.name = "AuthorizationError";
  }
}
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "u1", email: "admin@example.test", passwordSet: false }),
  isPlatformAdmin: async () => true,
  getMyOrganizations: async () => [],
  AuthorizationError,
}));

const { setPasswordAction } = await import("@/server/actions/auth");

const idle: ActionState = { status: "idle" };
const STRONG = "a-good-password-123";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ data: 0, error: null });
  getUserById.mockReset().mockResolvedValue({
    data: { user: { app_metadata: { provider: "email", providers: ["email"] } } },
    error: null,
  });
  updateUserById.mockReset().mockResolvedValue({ error: null });
  recordAuditEvent.mockReset();
});

describe("setPasswordAction", () => {
  it("sets the password, marks password_set via the service role (merging provider keys), audits, and redirects", async () => {
    await expect(
      setPasswordAction(idle, form({ password: STRONG, confirmPassword: STRONG })),
    ).rejects.toThrow("REDIRECT:/admin");
    expect(updateUser).toHaveBeenCalledWith({ password: STRONG });
    expect(updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { provider: "email", providers: ["email"], password_set: true },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("auth.password_established");
  });

  it("rejects mismatched passwords before writing anything", async () => {
    const result = await setPasswordAction(
      idle,
      form({ password: STRONG, confirmPassword: "different-123" }),
    );
    expect(result.status).toBe("error");
    expect(updateUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("does not mark the flag when the password update fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password is too weak" } });
    const result = await setPasswordAction(
      idle,
      form({ password: STRONG, confirmPassword: STRONG }),
    );
    expect(result.status).toBe("error");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("surfaces an error (not a silent success) when the flag write fails, and does not continue", async () => {
    updateUserById.mockResolvedValue({ error: { message: "service role rejected" } });
    const result = await setPasswordAction(
      idle,
      form({ password: STRONG, confirmPassword: STRONG }),
    );
    expect(result.status).toBe("error");
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
