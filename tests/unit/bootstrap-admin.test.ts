import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bootstrapAdmin,
  type AdminClient,
  type BootstrapOptions,
} from "../../scripts/bootstrap-admin";

/**
 * The bootstrap script is the only code path that creates a hosted user from the operator's
 * machine. These tests pin its safeguards with a fake service-role client: dry-run by
 * default, project-ref guard, refusal when other admins exist, ids-only audit metadata,
 * and a one-time link printed exactly once.
 */

type Row = Record<string, unknown>;

type FakeOptions = {
  admins?: { user_id: string }[];
  profiles?: { id: string; email: string }[];
  totalUsers?: number;
  inviteError?: { code?: string; status?: number; message: string };
  auditError?: { message: string };
};

function fakeClient(options: FakeOptions = {}) {
  const calls: string[] = [];
  const writes: { table: string; row: Row }[] = [];
  const tables: Record<string, Row[]> = {
    platform_admins: options.admins ?? [],
    profiles: options.profiles ?? [],
  };

  const client = {
    auth: {
      admin: {
        listUsers: async () => {
          calls.push("listUsers");
          return {
            data: {
              users: [],
              aud: "authenticated",
              nextPage: null,
              lastPage: 1,
              total: options.totalUsers ?? 0,
            },
            error: null,
          };
        },
        generateLink: async (params: { type: string; email: string; options?: { data?: Row } }) => {
          calls.push(`generateLink:${params.type}`);
          if (params.type === "invite" && options.inviteError) {
            return { data: { properties: null, user: null }, error: options.inviteError };
          }
          return {
            data: {
              user: { id: params.type === "invite" ? "user-new" : "user-existing" },
              properties: { hashed_token: `hash-${params.type}` },
            },
            error: null,
          };
        },
      },
    },
    from: (table: string) => ({
      select: () => {
        calls.push(`select:${table}`);
        const rows = tables[table] ?? [];
        const response = { data: rows, error: null };
        return {
          in: async () => response,
          then: (
            resolve: (value: typeof response) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => Promise.resolve(response).then(resolve, reject),
        };
      },
      upsert: async (row: Row) => {
        calls.push(`upsert:${table}`);
        writes.push({ table, row });
        return { error: null };
      },
      insert: async (row: Row) => {
        calls.push(`insert:${table}`);
        writes.push({ table, row });
        return { error: table === "audit_events" ? (options.auditError ?? null) : null };
      },
    }),
  };
  return { client: client as unknown as AdminClient, calls, writes };
}

const baseOptions: BootstrapOptions = {
  email: "Admin@Example.test",
  name: "Demo Admin",
  projectRef: "abcdefghijklmnopqrst",
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  appUrl: "http://localhost:3000",
  apply: false,
  allowExisting: false,
};

function collectLog() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("bootstrapAdmin guards", () => {
  it("refuses a project ref that does not match the Supabase URL before touching the client", async () => {
    const { client, calls } = fakeClient();
    await expect(
      bootstrapAdmin({ ...baseOptions, projectRef: "zzzzzzzzzzzzzzzzzzzz" }, client, () => {}),
    ).rejects.toThrow(/does not match NEXT_PUBLIC_SUPABASE_URL/);
    expect(calls).toEqual([]);
  });

  it("rejects an invalid email and an over-long name without touching the client", async () => {
    const { client, calls } = fakeClient();
    await expect(
      bootstrapAdmin({ ...baseOptions, email: "not-an-email" }, client, () => {}),
    ).rejects.toThrow(/valid email/);
    await expect(
      bootstrapAdmin({ ...baseOptions, name: "x".repeat(161) }, client, () => {}),
    ).rejects.toThrow(/160/);
    expect(calls).toEqual([]);
  });

  it("refuses when another platform admin exists and the email is not that admin", async () => {
    const { client, calls } = fakeClient({
      admins: [{ user_id: "user-other" }],
      profiles: [{ id: "user-other", email: "other@example.test" }],
    });
    await expect(bootstrapAdmin({ ...baseOptions, apply: true }, client, () => {})).rejects.toThrow(
      /already exists/,
    );
    expect(calls.some((call) => call.startsWith("generateLink"))).toBe(false);
    expect(calls.some((call) => call.startsWith("upsert"))).toBe(false);
  });

  it("proceeds for the existing admin's own email (re-link) and with --allow-existing", async () => {
    const relink = fakeClient({
      admins: [{ user_id: "user-existing" }],
      profiles: [{ id: "user-existing", email: "admin@example.test" }],
      inviteError: {
        code: "email_exists",
        status: 422,
        message: "A user with this email address has already been registered",
      },
    });
    const result = await bootstrapAdmin({ ...baseOptions, apply: true }, relink.client, () => {});
    expect(result).toMatchObject({ applied: true, linkType: "magiclink", emailIsAdmin: true });

    const allowed = fakeClient({
      admins: [{ user_id: "user-other" }],
      profiles: [{ id: "user-other", email: "other@example.test" }],
    });
    const second = await bootstrapAdmin(
      { ...baseOptions, apply: true, allowExisting: true },
      allowed.client,
      () => {},
    );
    expect(second).toMatchObject({ applied: true, linkType: "invite", userId: "user-new" });
  });
});

describe("bootstrapAdmin dry run (default)", () => {
  it("only reads and reports; nothing is generated or written", async () => {
    const { client, calls, writes } = fakeClient({ totalUsers: 0 });
    const { lines, log } = collectLog();
    const result = await bootstrapAdmin(baseOptions, client, log);
    expect(result).toEqual({
      applied: false,
      userId: null,
      linkType: null,
      existingAdmins: 0,
      emailIsAdmin: false,
      totalUsers: 0,
    });
    expect(calls).toEqual(["select:platform_admins", "listUsers"]);
    expect(writes).toEqual([]);
    expect(lines.join("\n")).toContain("DRY RUN: nothing was created or written");
    expect(lines.join("\n")).toContain("mode DRY RUN");
  });
});

describe("bootstrapAdmin --apply", () => {
  it("invites a new user, upserts the admin row, writes an ids-only audit row and prints the link once", async () => {
    const { client, calls, writes } = fakeClient({ totalUsers: 0 });
    const { lines, log } = collectLog();
    const result = await bootstrapAdmin({ ...baseOptions, apply: true }, client, log);

    expect(result).toMatchObject({ applied: true, userId: "user-new", linkType: "invite" });
    expect(calls).toEqual([
      "select:platform_admins",
      "listUsers",
      "generateLink:invite",
      "upsert:platform_admins",
      "insert:audit_events",
    ]);
    expect(writes[0]).toEqual({
      table: "platform_admins",
      row: { user_id: "user-new", note: "bootstrap script" },
    });
    const audit = writes[1].row;
    expect(audit).toMatchObject({
      actor_user_id: "user-new",
      action: "admin.bootstrapped",
      target_type: "user",
      target_id: "user-new",
    });
    expect(JSON.stringify(audit)).not.toMatch(/example\.test|Demo Admin/);

    const output = lines.join("\n");
    const linkLines = lines.filter((line) => line.includes("token_hash="));
    expect(linkLines).toHaveLength(1);
    expect(linkLines[0]).toBe(
      "http://localhost:3000/auth/confirm?token_hash=hash-invite&type=invite&next=%2Fauth%2Fset-password",
    );
    expect(output).toContain("mode APPLY");
    expect(output).not.toContain("DRY RUN");
  });

  it("falls back to a magic link for an existing account and still ends on the password page", async () => {
    const { client, calls } = fakeClient({
      inviteError: {
        code: "email_exists",
        status: 422,
        message: "A user with this email address has already been registered",
      },
    });
    const { lines, log } = collectLog();
    const result = await bootstrapAdmin({ ...baseOptions, apply: true }, client, log);
    expect(result).toMatchObject({ applied: true, userId: "user-existing", linkType: "magiclink" });
    expect(calls).toContain("generateLink:magiclink");
    const link = lines.find((line) => line.includes("token_hash="));
    expect(link).toBe(
      "http://localhost:3000/auth/confirm?token_hash=hash-magiclink&type=magiclink&next=%2Fauth%2Fset-password",
    );
  });

  it("fails loudly with recovery guidance when the audit row cannot be written", async () => {
    const { client } = fakeClient({ auditError: { message: "permission denied" } });
    await expect(bootstrapAdmin({ ...baseOptions, apply: true }, client, () => {})).rejects.toThrow(
      /audit row not written for user user-new: permission denied. The admin row exists; re-run with --apply/,
    );
  });

  it("surfaces any other invitation error", async () => {
    const { client, writes } = fakeClient({
      inviteError: { status: 401, message: "Invalid API key" },
    });
    await expect(bootstrapAdmin({ ...baseOptions, apply: true }, client, () => {})).rejects.toThrow(
      /Could not create the user: Invalid API key/,
    );
    expect(writes).toEqual([]);
  });
});

describe("bootstrapAdmin --link-file", () => {
  it("writes the link to the file and keeps the token out of the terminal output", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "talentflow-link-"));
    const linkFile = path.join(dir, "link.txt");
    try {
      const { client } = fakeClient();
      const { lines, log } = collectLog();
      await bootstrapAdmin({ ...baseOptions, apply: true, linkFile }, client, log);
      const expectedLink =
        "http://localhost:3000/auth/confirm?token_hash=hash-invite&type=invite&next=%2Fauth%2Fset-password";
      expect(readFileSync(linkFile, "utf8")).toBe(`${expectedLink}` + String.fromCharCode(10));
      const output = lines.join(" | ");
      expect(output).not.toContain("hash-invite");
      expect(output).toContain("token_hash=[redacted]");
      expect(output).toContain("delete the file after use");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
