import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildInviteUrl, redactInviteUrl, type InviteLinkType } from "../src/lib/invite";
import type { Database } from "../src/lib/supabase/database.types";

/**
 * Creates the first platform admin of a Supabase project (docs/BOOTSTRAP_ADMIN_PLAN.md).
 *
 *   pnpm bootstrap:admin --email admin@example.com --name "Demo Admin" --project-ref <ref>
 *   pnpm bootstrap:admin --email … --project-ref <ref> --apply
 *
 * Safe by default: without `--apply` the script only reads (how many platform admins and
 * auth users exist, whether this email already is an admin) and prints what it would do.
 * With `--apply` it creates the auth user through an invitation link, upserts the
 * `platform_admins` row, writes an `admin.bootstrapped` audit row (ids only, never the
 * email) and prints the one-time link exactly once. If another admin already exists the
 * script refuses unless `--allow-existing` is given, because further admins belong in the
 * admin UI. Re-running for the same email is safe: the existing account receives a magic
 * link instead of an invitation.
 *
 * `--link-file <path>` writes the link to that file (mode 0600) instead of the terminal and
 * logs only a redacted form, so the token never enters terminal scrollback or a transcript.
 *
 * Guards: `--project-ref` must match the host of NEXT_PUBLIC_SUPABASE_URL, so the script
 * cannot run against another project by accident. Reads SUPABASE_* from .env.local via
 * `node --env-file`; the service-role key never appears in any output.
 */

export type BootstrapOptions = {
  email: string;
  name: string;
  projectRef: string;
  supabaseUrl: string;
  appUrl: string;
  apply: boolean;
  allowExisting: boolean;
  /** Write the one-time link here instead of printing it; the log shows a redacted form. */
  linkFile?: string;
};

export type BootstrapResult = {
  applied: boolean;
  userId: string | null;
  linkType: InviteLinkType | null;
  existingAdmins: number;
  emailIsAdmin: boolean;
  totalUsers: number | null;
};

export type AdminClient = SupabaseClient<Database>;
type Log = (line: string) => void;

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;

const optionsSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  name: z.string().max(160, "Name must be at most 160 characters"),
  projectRef: z.string().regex(PROJECT_REF_PATTERN, "Project ref must be 20 lowercase letters"),
  supabaseUrl: z.url(),
  appUrl: z.url(),
  apply: z.boolean(),
  allowExisting: z.boolean(),
  linkFile: z.string().min(1).optional(),
});

export function assertProjectRefMatches(supabaseUrl: string, projectRef: string): void {
  const host = new URL(supabaseUrl).hostname;
  if (!host.startsWith(`${projectRef}.`)) {
    throw new Error(
      `--project-ref ${projectRef} does not match NEXT_PUBLIC_SUPABASE_URL (${host})`,
    );
  }
}

export async function bootstrapAdmin(
  rawOptions: BootstrapOptions,
  client: AdminClient,
  log: Log,
): Promise<BootstrapResult> {
  const parsed = optionsSchema.safeParse({
    ...rawOptions,
    email: rawOptions.email.trim().toLowerCase(),
    name: rawOptions.name.trim(),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid options");
  }
  const options = parsed.data;
  assertProjectRefMatches(options.supabaseUrl, options.projectRef);

  log(
    `Project ${options.projectRef} (${new URL(options.supabaseUrl).host}); app URL ${options.appUrl}; mode ${options.apply ? "APPLY" : "DRY RUN"}.`,
  );

  // Read-only pre-flight, in both modes.
  const { data: admins, error: adminsError } = await client
    .from("platform_admins")
    .select("user_id");
  if (adminsError) throw new Error(`Could not read platform_admins: ${adminsError.message}`);
  const adminIds = (admins ?? []).map((row) => row.user_id);

  let emailIsAdmin = false;
  if (adminIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, email")
      .in("id", adminIds);
    if (profilesError) throw new Error(`Could not read profiles: ${profilesError.message}`);
    emailIsAdmin = (profiles ?? []).some((row) => row.email.toLowerCase() === options.email);
  }

  const { data: usersPage, error: usersError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (usersError) throw new Error(`Could not list auth users: ${usersError.message}`);
  const totalUsers = "total" in usersPage ? usersPage.total : null;

  log(
    `Existing platform admins: ${adminIds.length}${emailIsAdmin ? " (including this email)" : ""}; auth users: ${totalUsers ?? "unknown"}.`,
  );

  if (adminIds.length > 0 && !emailIsAdmin && !options.allowExisting) {
    throw new Error(
      "A platform admin already exists. Add further admins from /admin/admins, or pass --allow-existing to use this script anyway.",
    );
  }

  const base = {
    existingAdmins: adminIds.length,
    emailIsAdmin,
    totalUsers,
  };

  if (!options.apply) {
    log(
      emailIsAdmin
        ? "Would generate a new one-time link for the existing admin account (no new user)."
        : "Would create the auth user by invitation, insert the platform_admins row and an admin.bootstrapped audit row, then print a one-time link.",
    );
    log("DRY RUN: nothing was created or written. Re-run with --apply to proceed.");
    return { ...base, applied: false, userId: null, linkType: null };
  }

  // Invite creates the auth user without a password; a magic link covers an existing account.
  let userId: string;
  let tokenHash: string | null;
  let linkType: InviteLinkType = "invite";
  const invite = await client.auth.admin.generateLink({
    type: "invite",
    email: options.email,
    options: { data: { full_name: options.name } },
  });
  if (!invite.error && invite.data.user) {
    userId = invite.data.user.id;
    tokenHash = invite.data.properties?.hashed_token ?? null;
  } else if (
    invite.error?.code === "email_exists" ||
    (invite.error?.status === 422 && /already/i.test(invite.error.message))
  ) {
    const magic = await client.auth.admin.generateLink({ type: "magiclink", email: options.email });
    if (magic.error || !magic.data.user) {
      throw new Error(`Could not look up the existing user: ${magic.error?.message}`);
    }
    userId = magic.data.user.id;
    tokenHash = magic.data.properties?.hashed_token ?? null;
    linkType = "magiclink";
  } else {
    throw new Error(`Could not create the user: ${invite.error?.message}`);
  }

  const { error: adminError } = await client
    .from("platform_admins")
    .upsert({ user_id: userId, note: "bootstrap script" }, { onConflict: "user_id" });
  if (adminError) {
    throw new Error(
      `platform_admins upsert failed for user ${userId}: ${adminError.message}. The auth user exists; re-run with --apply to complete the bootstrap.`,
    );
  }

  const { error: auditError } = await client.from("audit_events").insert({
    actor_user_id: userId,
    action: "admin.bootstrapped",
    target_type: "user",
    target_id: userId,
    metadata: {
      source: "scripts/bootstrap-admin.ts",
      project_ref: options.projectRef,
      link_type: linkType,
    },
  });
  if (auditError) {
    throw new Error(
      `audit row not written for user ${userId}: ${auditError.message}. The admin row exists; re-run with --apply to record the audit event.`,
    );
  }

  log(`Platform admin ensured for user ${userId} (${linkType}).`);
  if (tokenHash) {
    // Always finish on the password page: an invited account has no password yet, and a
    // re-link after an expired invitation must not skip that step.
    log(
      "One-time link (single use; expires per the project's email OTP setting; share privately, never paste into chat or commit):",
    );
    const link = buildInviteUrl(options.appUrl, tokenHash, linkType, "/auth/set-password");
    if (options.linkFile) {
      writeFileSync(
        options.linkFile,
        `${link}
`,
        { mode: 0o600 },
      );
      log(`Written to ${options.linkFile} (delete the file after use): ${redactInviteUrl(link)}`);
    } else {
      log(link);
    }
  } else {
    log("No link token was returned; re-run with --apply to generate a magic link.");
  }
  return { ...base, applied: true, userId, linkType };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string", default: "" },
      "project-ref": { type: "string" },
      apply: { type: "boolean", default: false },
      "allow-existing": { type: "boolean", default: false },
      "link-file": { type: "string" },
    },
  });
  if (!values.email || !values["project-ref"]) {
    throw new Error(
      "Usage: --email <email> --project-ref <ref> [--name <full name>] [--apply] [--allow-existing] [--link-file <path>]",
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local (pnpm env:set SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await bootstrapAdmin(
    {
      email: values.email,
      name: values.name ?? "",
      projectRef: values["project-ref"].trim(),
      supabaseUrl,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      apply: values.apply ?? false,
      allowExisting: values["allow-existing"] ?? false,
      linkFile: values["link-file"],
    },
    client,
    (line) => console.log(line),
  );
}

const invokedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
