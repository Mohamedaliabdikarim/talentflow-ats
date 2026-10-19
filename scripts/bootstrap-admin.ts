import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { buildInviteUrl } from "../src/lib/invite";

/**
 * Creates the first platform admin of a Supabase project.
 *
 * Usage (never commit the output):
 *   pnpm bootstrap:admin --email admin@example.com --name "Demo Admin" --project-ref <ref>
 *
 * Reads SUPABASE_* values from .env.local (node --env-file). The --project-ref guard must
 * match the host in NEXT_PUBLIC_SUPABASE_URL so the script cannot run against the wrong
 * project by accident. The one-time invitation link is printed to the terminal exactly
 * once; the operator shares it privately with the admin, who then sets a password.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string", default: "" },
      "project-ref": { type: "string" },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const projectRef = values["project-ref"]?.trim();
  if (!email || !projectRef) {
    throw new Error("Usage: --email <email> --project-ref <ref> [--name <full name>]");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
  }
  if (!new URL(url).hostname.startsWith(`${projectRef}.`)) {
    throw new Error(`--project-ref ${projectRef} does not match NEXT_PUBLIC_SUPABASE_URL`);
  }

  const service = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Invite creates the auth user without a password; magic link covers an existing account.
  let userId: string;
  let tokenHash: string | null = null;
  let linkType: "invite" | "magiclink" = "invite";
  const invite = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: values.name ?? "" } },
  });
  if (!invite.error && invite.data.user) {
    userId = invite.data.user.id;
    tokenHash = invite.data.properties?.hashed_token ?? null;
  } else if (invite.error?.code === "email_exists") {
    const magic = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (magic.error || !magic.data.user) {
      throw new Error(`Could not look up existing user: ${magic.error?.message}`);
    }
    userId = magic.data.user.id;
    tokenHash = magic.data.properties?.hashed_token ?? null;
    linkType = "magiclink";
  } else {
    throw new Error(`Could not create user: ${invite.error?.message}`);
  }

  const { error: adminError } = await service
    .from("platform_admins")
    .upsert({ user_id: userId, note: "bootstrap script" }, { onConflict: "user_id" });
  if (adminError) throw new Error(`platform_admins upsert failed: ${adminError.message}`);

  const { error: auditError } = await service.from("audit_events").insert({
    actor_user_id: userId,
    action: "admin.bootstrapped",
    target_type: "user",
    target_id: userId,
    metadata: { source: "scripts/bootstrap-admin.ts", project_ref: projectRef },
  });
  if (auditError) console.warn(`audit row not written: ${auditError.message}`);

  console.log(`Platform admin ensured for user ${userId}.`);
  if (tokenHash) {
    const next = linkType === "invite" ? "/auth/set-password" : "/app";
    console.log("One-time link (share privately, expires per project settings):");
    console.log(buildInviteUrl(appUrl, tokenHash, linkType, next));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
