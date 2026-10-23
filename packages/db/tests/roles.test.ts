import { afterAll, describe, expect, it } from 'vitest';
import {
  asOwner,
  asUser,
  closePool,
  describeDb,
  expectRefused,
  expectSqlError,
  inRollback,
  type Db,
} from './helpers/pg';
import { createWorld, type World } from './helpers/world';

const rows = async <T extends Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
) => (await db.query<T>(sql, params)).rows;

const memberId = async (db: Db, world: World, user: string) =>
  (
    await rows<{ id: string }>(
      db,
      `select id from tenant_members where tenant_id = $1 and user_id = $2`,
      [world.tenants.A, user],
    )
  )[0]!.id;

describeDb('roles and guards inside a tenant (ESCOPO §4.1)', () => {
  afterAll(closePool);

  describe('departments (config tables need admin)', () => {
    it('viewers read but cannot write; admins write', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.viewerA);
        expect(await rows(db, `select id from departments`)).toHaveLength(1);
        await expectSqlError(
          db,
          '42501',
          `insert into departments (tenant_id, name) values ($1, 'RH')`,
          [world.tenants.A],
        );
        await expectRefused(db, `update departments set name = 'X' where id = $1`, [world.deptA]);

        await asUser(db, world.users.adminA);
        await db.query(`insert into departments (tenant_id, name) values ($1, 'RH')`, [
          world.tenants.A,
        ]);
        expect(await rows(db, `select id from departments`)).toHaveLength(2);
      });
    });
  });

  describe('tenant_members', () => {
    it('admins add members but cannot create owners; owners can', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.adminA);
        await expectSqlError(
          db,
          '42501',
          `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'owner')`,
          [world.tenants.A, world.users.outsider],
        );
        await db.query(
          `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'operator')`,
          [world.tenants.A, world.users.outsider],
        );
        const outsiderRow = await memberId(db, world, world.users.outsider);
        await expectSqlError(
          db,
          '42501',
          `update tenant_members set role = 'owner' where id = $1`,
          [outsiderRow],
        );

        await asUser(db, world.users.ownerA);
        await db.query(`update tenant_members set role = 'owner' where id = $1`, [outsiderRow]);
      });
    });

    it('admins cannot demote or remove an owner, nor promote themselves', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asOwner(db);
        const ownerRow = await memberId(db, world, world.users.ownerA);
        const adminRow = await memberId(db, world, world.users.adminA);
        await asUser(db, world.users.adminA);
        await expectRefused(db, `update tenant_members set role = 'viewer' where id = $1`, [
          ownerRow,
        ]);
        await expectRefused(db, `delete from tenant_members where id = $1`, [ownerRow]);
        await expectSqlError(
          db,
          '42501',
          `update tenant_members set role = 'owner' where id = $1`,
          [adminRow],
        );
      });
    });

    it('viewers cannot manage members', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.viewerA);
        await expectSqlError(
          db,
          '42501',
          `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'viewer')`,
          [world.tenants.A, world.users.outsider],
        );
        await expectRefused(db, `update tenant_members set role = 'admin' where user_id = $1`, [
          world.users.viewerA,
        ]);
      });
    });

    it('the last owner cannot leave or be demoted', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asOwner(db);
        const ownerRow = await memberId(db, world, world.users.ownerA);
        await asUser(db, world.users.ownerA);
        await expectSqlError(
          db,
          '23514',
          `update tenant_members set role = 'admin' where id = $1`,
          [ownerRow],
        );
        await expectSqlError(db, '23514', `delete from tenant_members where id = $1`, [ownerRow]);
      });
    });

    it('deleting a whole tenant is not blocked by the last-owner rule', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await db.query(`delete from tenants where id = $1`, [world.tenants.B]);
        expect(
          await rows(db, `select 1 from tenant_members where tenant_id = $1`, [world.tenants.B]),
        ).toHaveLength(0);
      });
    });
  });

  describe('tenants and contracted modules', () => {
    it('tenant admins edit name and branding, but not slug, status or partner', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.adminA);
        await db.query(
          `update tenants set name = 'Novo nome', branding = '{"primary":"#0a7"}' where id = $1`,
          [world.tenants.A],
        );
        await expectSqlError(db, '42501', `update tenants set status = 'suspended' where id = $1`, [
          world.tenants.A,
        ]);
        await expectSqlError(db, '42501', `update tenants set slug = 'outro' where id = $1`, [
          world.tenants.A,
        ]);
        await expectSqlError(db, '42501', `update tenants set partner_id = $2 where id = $1`, [
          world.tenants.A,
          world.partners.p2,
        ]);
        await asUser(db, world.users.viewerA);
        await expectRefused(db, `update tenants set name = 'x' where id = $1`, [world.tenants.A]);
      });
    });

    it('tenant admins tune module settings but only the partner turns modules on/off', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.adminA);
        await db.query(
          `update tenant_modules set settings = '{"min_score": 0.5}' where tenant_id = $1 and module = 'log'`,
          [world.tenants.A],
        );
        await expectSqlError(
          db,
          '42501',
          `update tenant_modules set enabled = false where tenant_id = $1 and module = 'log'`,
          [world.tenants.A],
        );
        await expectSqlError(
          db,
          '42501',
          `insert into tenant_modules (tenant_id, module) values ($1, 'adm')`,
          [world.tenants.A],
        );

        await asUser(db, world.users.partnerAdmin1);
        await db.query(
          `update tenant_modules set enabled = false where tenant_id = $1 and module = 'log'`,
          [world.tenants.A],
        );
        await db.query(`insert into tenant_modules (tenant_id, module) values ($1, 'adm')`, [
          world.tenants.A,
        ]);
      });
    });
  });

  describe('partner staff', () => {
    it('partner admins manage their own tenants only', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.partnerAdmin1);
        const visible = await rows<{ id: string }>(db, `select id from tenants`);
        expect(visible.map((r) => r.id)).toEqual([world.tenants.A]);
        await db.query(`update tenants set status = 'suspended' where id = $1`, [world.tenants.A]);
        await expectRefused(db, `update tenants set status = 'suspended' where id = $1`, [
          world.tenants.B,
        ]);
        const created = await rows<{ id: string }>(
          db,
          `insert into tenants (partner_id, name, slug) values ($1, 'Novo cliente', 'novo-cliente-x') returning id`,
          [world.partners.p1],
        );
        expect(created).toHaveLength(1);
        await expectSqlError(
          db,
          '42501',
          `insert into tenants (partner_id, name, slug) values ($1, 'Intruso', 'intruso-x')`,
          [world.partners.p2],
        );
        // First owner of the new tenant is added by the partner.
        await db.query(
          `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'owner')`,
          [created[0]!.id, world.users.outsider],
        );
      });
    });

    it('partner staff do not see operational data of tenants (LGPD minimization)', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        for (const user of [world.users.partnerAdmin1, world.users.partnerViewer1]) {
          await asUser(db, user);
          expect(await rows(db, `select id from departments`)).toHaveLength(0);
          expect(await rows(db, `select id from audit_log`)).toHaveLength(0);
        }
        await asUser(db, world.users.partnerViewer1);
        expect(await rows(db, `select id from tenants`)).toHaveLength(1);
        await expectRefused(db, `update tenants set name = 'x' where id = $1`, [world.tenants.A]);
      });
    });
  });

  describe('profiles', () => {
    it('users see colleagues of their tenants, not users of other tenants', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.viewerA);
        const ids = (await rows<{ id: string }>(db, `select id from profiles`)).map((r) => r.id);
        expect(ids).toEqual(
          expect.arrayContaining([world.users.ownerA, world.users.adminA, world.users.viewerA]),
        );
        expect(ids).not.toContain(world.users.ownerB);
        await expectRefused(db, `update profiles set full_name = 'x' where id = $1`, [
          world.users.ownerA,
        ]);
        await db.query(`update profiles set full_name = 'Eu' where id = $1`, [world.users.viewerA]);
      });
    });
  });

  describe('audit log (ESCOPO §4.8)', () => {
    it('records who changed what, with before/after', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.adminA);
        await db.query(`update departments set name = 'Qualidade e Regulatório' where id = $1`, [
          world.deptA,
        ]);
        const [entry] = await rows<{
          user_id: string;
          action: string;
          before: { name: string };
          after: { name: string };
        }>(
          db,
          `select user_id, action, before, after from audit_log
            where entity = 'departments' and entity_id = $1 and action = 'update'`,
          [world.deptA],
        );
        expect(entry).toMatchObject({
          user_id: world.users.adminA,
          action: 'update',
          before: { name: 'Qualidade' },
          after: { name: 'Qualidade e Regulatório' },
        });
      });
    });

    it('is immutable for users and hidden from roles below manager', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        await asUser(db, world.users.ownerA);
        expect((await rows(db, `select id from audit_log`)).length).toBeGreaterThan(0);
        await expectSqlError(db, '42501', `update audit_log set action = 'delete'`);
        await expectSqlError(db, '42501', `delete from audit_log`);
        await asUser(db, world.users.viewerA);
        expect(await rows(db, `select id from audit_log`)).toHaveLength(0);
        await asUser(db, world.users.qualityA);
        expect(await rows(db, `select id from audit_log`)).toHaveLength(0);
      });
    });

    it('is immutable even for the service role', async () => {
      await inRollback(async (db) => {
        await createWorld(db);
        await db.query('set local role service_role');
        await expectSqlError(db, '42501', `delete from audit_log`);
        await expectSqlError(db, '42501', `update audit_log set action = 'delete'`);
      });
    });

    it('ignores updates that only touch updated_at', async () => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        const before = await rows(db, `select id from audit_log where entity_id = $1`, [
          world.deptA,
        ]);
        await db.query(`update departments set updated_at = now() where id = $1`, [world.deptA]);
        const after = await rows(db, `select id from audit_log where entity_id = $1`, [
          world.deptA,
        ]);
        expect(after).toHaveLength(before.length);
      });
    });
  });
});

describeDb('optional 2FA is enforced by RLS (ESCOPO §2)', () => {
  afterAll(closePool);

  const enrollVerifiedFactor = (db: Db, userId: string) =>
    db.query(
      `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
       values (gen_random_uuid(), $1, 'app', 'totp', 'verified', now(), now(), 'x')`,
      [userId],
    );

  const actAs = async (db: Db, userId: string, aal: 'aal1' | 'aal2') => {
    await db.query('set local role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated', aal }),
    ]);
  };

  it('users without 2FA keep access with a password-only session', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await actAs(db, world.users.ownerA, 'aal1');
      expect(await rows(db, `select id from departments`)).toHaveLength(1);
    });
  });

  it('users who enrolled 2FA see nothing until the session passes 2FA', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await enrollVerifiedFactor(db, world.users.ownerA);

      await actAs(db, world.users.ownerA, 'aal1');
      expect(await rows(db, `select id from departments`)).toHaveLength(0);
      expect(await rows(db, `select id from tenants`)).toHaveLength(0);
      await expectRefused(db, `update departments set name = 'x' where id = $1`, [world.deptA]);

      await actAs(db, world.users.ownerA, 'aal2');
      expect(await rows(db, `select id from departments`)).toHaveLength(1);
      expect(await rows(db, `select id from tenants`)).toHaveLength(1);
    });
  });
});
