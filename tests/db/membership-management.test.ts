import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Membership management at the database level (ADR-040). Ordinary members, owners included,
 * cannot change roles, deactivate anyone, insert memberships or grant themselves platform
 * admin; a platform admin can; a deactivated membership loses tenant access immediately and
 * cannot self-reactivate through the invitation path. Scoped to this file's own seed ids.
 */

const RLS_OR_PRIVILEGE_ERROR = "42501";

const ids = {
  admin: randomUUID(),
  owner: randomUUID(),
  member: randomUUID(),
  otherTenantUser: randomUUID(),
  org: randomUUID(),
  otherOrg: randomUUID(),
  ownerMembership: randomUUID(),
  memberMembership: randomUUID(),
  otherMembership: randomUUID(),
};

let pool: pg.Pool;

async function asUser<T>(userId: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await run(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function expectError(client: pg.PoolClient, sql: string, params: unknown[], code: string) {
  await client.query("savepoint expect_error");
  try {
    await client.query(sql, params);
    expect.unreachable(`expected error ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  } finally {
    await client.query("rollback to savepoint expect_error");
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values
       ($1, 'mm-admin@example.test'), ($2, 'mm-owner@example.test'),
       ($3, 'mm-member@example.test'), ($4, 'mm-other@example.test')`,
    [ids.admin, ids.owner, ids.member, ids.otherTenantUser],
  );
  await pool.query(`insert into public.platform_admins (user_id) values ($1)`, [ids.admin]);
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'MM Org', 'mm-org'), ($2, 'MM Other', 'mm-other')`,
    [ids.org, ids.otherOrg],
  );
  await pool.query(
    `insert into public.organization_memberships (id, organization_id, user_id, role, status) values
       ($1, $4, $5, 'owner', 'active'),
       ($2, $4, $6, 'member', 'active'),
       ($3, $7, $8, 'owner', 'active')`,
    [
      ids.ownerMembership,
      ids.memberMembership,
      ids.otherMembership,
      ids.org,
      ids.owner,
      ids.member,
      ids.otherOrg,
      ids.otherTenantUser,
    ],
  );
});

afterAll(async () => {
  await pool.query(`delete from public.organizations where id = any($1::uuid[])`, [
    [ids.org, ids.otherOrg],
  ]);
  await pool.query(`delete from public.platform_admins where user_id = $1`, [ids.admin]);
  await pool.query(`delete from auth.users where id = any($1::uuid[])`, [
    [ids.admin, ids.owner, ids.member, ids.otherTenantUser],
  ]);
  await pool.end();
});

describe("ordinary members and owners cannot manage membership", () => {
  it("a member cannot promote themselves or anyone else (update affects no rows)", async () => {
    await asUser(ids.member, async (client) => {
      const self = await client.query(
        `update public.organization_memberships set role = 'owner' where id = $1`,
        [ids.memberMembership],
      );
      const other = await client.query(
        `update public.organization_memberships set role = 'member' where id = $1`,
        [ids.ownerMembership],
      );
      expect(self.rowCount).toBe(0);
      expect(other.rowCount).toBe(0);
    });
  });

  it("an owner cannot change roles or deactivate anyone either (owner has no extra write rights)", async () => {
    await asUser(ids.owner, async (client) => {
      const promote = await client.query(
        `update public.organization_memberships set role = 'owner' where id = $1`,
        [ids.memberMembership],
      );
      const deactivate = await client.query(
        `update public.organization_memberships set status = 'disabled' where id = $1`,
        [ids.memberMembership],
      );
      const remove = await client.query(
        `delete from public.organization_memberships where id = $1`,
        [ids.memberMembership],
      );
      expect(promote.rowCount).toBe(0);
      expect(deactivate.rowCount).toBe(0);
      expect(remove.rowCount).toBe(0);
    });
  });

  it("an owner cannot insert a membership (no self-service invitations)", async () => {
    await asUser(ids.owner, async (client) => {
      await expectError(
        client,
        `insert into public.organization_memberships (organization_id, user_id, role, status) values ($1, $2, 'member', 'invited')`,
        [ids.org, ids.otherTenantUser],
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });

  it("neither role can grant themselves platform admin", async () => {
    for (const user of [ids.owner, ids.member]) {
      await asUser(user, async (client) => {
        await expectError(
          client,
          `insert into public.platform_admins (user_id) values ($1)`,
          [user],
          RLS_OR_PRIVILEGE_ERROR,
        );
      });
    }
  });

  it("members see the roster of their own tenant only", async () => {
    const rows = await asUser(ids.member, async (client) => {
      const { rows } = await client.query(
        `select organization_id from public.organization_memberships`,
      );
      return rows;
    });
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.organization_id === ids.org)).toBe(true);
  });
});

describe("platform admin membership management", () => {
  it("can change a role and deactivate / reactivate a membership", async () => {
    await asUser(ids.admin, async (client) => {
      const promote = await client.query(
        `update public.organization_memberships set role = 'owner' where id = $1 and status = 'active' and role = 'member'`,
        [ids.memberMembership],
      );
      expect(promote.rowCount).toBe(1);
      const deactivate = await client.query(
        `update public.organization_memberships set status = 'disabled' where id = $1 and status = 'active'`,
        [ids.memberMembership],
      );
      expect(deactivate.rowCount).toBe(1);
      const reactivate = await client.query(
        `update public.organization_memberships set status = 'active' where id = $1 and status = 'disabled'`,
        [ids.memberMembership],
      );
      expect(reactivate.rowCount).toBe(1);
    });
  });

  it("a deactivated membership loses tenant access immediately and cannot self-reactivate", async () => {
    await pool.query(
      `update public.organization_memberships set status = 'disabled' where id = $1`,
      [ids.memberMembership],
    );
    try {
      await asUser(ids.member, async (client) => {
        const orgs = await client.query(`select id from public.organizations`);
        const jobs = await client.query(`select id from public.jobs where organization_id = $1`, [
          ids.org,
        ]);
        expect(orgs.rows).toHaveLength(0);
        expect(jobs.rows).toHaveLength(0);
        const activated = await client.query(`select public.activate_my_memberships() as count`);
        expect(activated.rows[0].count).toBe(0); // only 'invited' rows activate
        const { rows } = await client.query(
          `select status from public.organization_memberships where id = $1`,
          [ids.memberMembership],
        );
        expect(rows).toHaveLength(0); // not even visible once access is gone
      });
    } finally {
      await pool.query(
        `update public.organization_memberships set status = 'active' where id = $1`,
        [ids.memberMembership],
      );
    }
  });
});
