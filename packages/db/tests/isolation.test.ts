import { afterAll, expect, it } from 'vitest';
import { listTenantTables } from './helpers/catalog';
import {
  asOwner,
  asUser,
  closePool,
  dbAvailable,
  describeDb,
  expectRefused,
  inRollback,
  type Db,
} from './helpers/pg';
import { TABLE_FIXTURES } from './helpers/table-fixtures';
import { createWorld } from './helpers/world';

/** Discovered from the catalog, so every future tenant table is covered automatically. */
const tenantTables = dbAvailable ? await inRollback((db) => listTenantTables(db)) : [];

const count = async (db: Db, sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }>(sql, params)).rows[0]!.n);

describeDb('tenant isolation, per table (ESCOPO §10: A never reads B)', () => {
  afterAll(closePool);

  it('found tenant tables in the catalog', () => {
    expect(tenantTables.length).toBeGreaterThan(0);
  });

  it.each(tenantTables)(
    '%s: the owner of tenant A cannot read, change, delete or create rows of tenant B',
    async (table) => {
      await inRollback(async (db) => {
        const world = await createWorld(db);
        const fixture = TABLE_FIXTURES[table];
        if (!fixture) throw new Error(`missing fixture for ${table}`);
        const { A, B } = world.tenants;
        await fixture(db, world, A);
        await fixture(db, world, B);
        const ownRows = await count(db, `select count(*) as n from ${table} where tenant_id = $1`, [
          A,
        ]);
        const otherRows = await count(
          db,
          `select count(*) as n from ${table} where tenant_id = $1`,
          [B],
        );
        expect(ownRows).toBeGreaterThan(0);
        expect(otherRows).toBeGreaterThan(0);

        // ownerA has the highest role in A: any refusal below comes from tenant isolation, not role.
        await asUser(db, world.users.ownerA);
        expect(
          await count(db, `select count(*) as n from ${table} where tenant_id = $1`, [B]),
        ).toBe(0);
        expect(await count(db, `select count(*) as n from ${table}`)).toBe(ownRows);

        await expectRefused(db, `update ${table} set updated_at = now() where tenant_id = $1`, [B]);
        await expectRefused(db, `delete from ${table} where tenant_id = $1`, [B]);
        await expectRefused(db, `update ${table} set tenant_id = $2 where tenant_id = $1`, [A, B]);

        await db.query('savepoint cross_insert');
        const outcome = await fixture(db, world, B).then(
          () => 'inserted',
          (error: { code?: string }) => error.code,
        );
        await db.query('rollback to savepoint cross_insert');
        expect(outcome).toBe('42501');

        // Nothing of B changed.
        await asOwner(db);
        expect(
          await count(db, `select count(*) as n from ${table} where tenant_id = $1`, [B]),
        ).toBe(otherRows);
      });
    },
  );

  it('tenants: a user of A cannot see or change tenant B', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.ownerA);
      const visible = await db.query<{ id: string }>(`select id from tenants`);
      expect(visible.rows.map((r) => r.id)).toEqual([world.tenants.A]);
      await expectRefused(db, `update tenants set name = 'hacked' where id = $1`, [
        world.tenants.B,
      ]);
      await expectRefused(db, `delete from tenants where id = $1`, [world.tenants.B]);
    });
  });

  it('a user without any membership sees nothing', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.outsider);
      for (const table of [...tenantTables, 'tenants', 'partners', 'partner_members']) {
        expect(await count(db, `select count(*) as n from ${table}`), table).toBe(0);
      }
    });
  });
});
