import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/** Migration 0003: invited users activate only their own memberships. */

const ids = {
  invitedUser: randomUUID(),
  otherInvitedUser: randomUUID(),
  org: randomUUID(),
};

let pool: pg.Pool;

async function asUser(userId: string, run: (client: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await run(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'invited@example.test'), ($2, 'other@example.test')`,
    [ids.invitedUser, ids.otherInvitedUser],
  );
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'Org Act', 'org-act')`,
    [ids.org],
  );
  await pool.query(
    `insert into public.organization_memberships (organization_id, user_id, status)
     values ($1, $2, 'invited'), ($1, $3, 'invited')`,
    [ids.org, ids.invitedUser, ids.otherInvitedUser],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("activate_my_memberships", () => {
  it("an invited user has no tenant access before activation", async () => {
    await asUser(ids.invitedUser, async (client) => {
      const { rows } = await client.query(`select id from public.organizations`);
      expect(rows).toHaveLength(0);
    });
  });

  it("activates only the caller's memberships and grants access afterwards", async () => {
    await asUser(ids.invitedUser, async (client) => {
      const activated = await client.query(`select public.activate_my_memberships() as count`);
      expect(activated.rows[0].count).toBe(1);

      const orgs = await client.query(`select slug from public.organizations`);
      expect(orgs.rows.map((row) => row.slug)).toEqual(["org-act"]);

      // Superuser view inside the same transaction: the other invitation is untouched.
      await client.query("reset role");
      const statuses = await client.query(
        // Cast: enum columns sort by definition order (invited < active), not alphabetically.
        `select user_id, status from public.organization_memberships where organization_id = $1 order by status::text`,
        [ids.org],
      );
      expect(statuses.rows).toEqual([
        { user_id: ids.invitedUser, status: "active" },
        { user_id: ids.otherInvitedUser, status: "invited" },
      ]);
    });
  });

  it("returns zero when nothing is pending and rejects anonymous callers", async () => {
    await asUser(ids.invitedUser, async (client) => {
      await client.query(`select public.activate_my_memberships()`);
      const again = await client.query(`select public.activate_my_memberships() as count`);
      expect(again.rows[0].count).toBe(0);
    });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      await expect(client.query(`select public.activate_my_memberships()`)).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
