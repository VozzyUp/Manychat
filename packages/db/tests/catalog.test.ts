import { afterAll, expect, it } from 'vitest';
import {
  APPEND_ONLY_TABLES,
  GLOBAL_TABLES,
  listPublicTables,
  listTenantTables,
} from './helpers/catalog';
import { closePool, describeDb, inRollback } from './helpers/pg';
import { TABLE_FIXTURES } from './helpers/table-fixtures';

describeDb('schema catalog rules (CLAUDE.md rule 1, ESCOPO §9)', () => {
  afterAll(closePool);

  it('every table in public has row level security enabled', async () => {
    await inRollback(async (db) => {
      const { rows } = await db.query<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });
  });

  it('every business table has tenant_id uuid not null', async () => {
    await inRollback(async (db) => {
      const tables = (await listPublicTables(db)).filter(
        (t) => !(GLOBAL_TABLES as readonly string[]).includes(t),
      );
      const { rows } = await db.query<{
        table_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `select table_name, data_type, is_nullable from information_schema.columns
          where table_schema = 'public' and column_name = 'tenant_id'`,
      );
      const byTable = new Map(rows.map((r) => [r.table_name, r]));
      for (const table of tables) {
        expect(byTable.get(table), `${table} needs tenant_id`).toMatchObject({
          data_type: 'uuid',
          is_nullable: 'NO',
        });
      }
    });
  });

  it('every tenant table has an RLS isolation fixture', async () => {
    await inRollback(async (db) => {
      const missing = (await listTenantTables(db)).filter((t) => !(t in TABLE_FIXTURES));
      expect(missing, 'add these tables to tests/helpers/table-fixtures.ts').toEqual([]);
    });
  });

  it('every tenant table has a select policy and an index led by tenant_id', async () => {
    await inRollback(async (db) => {
      for (const table of await listTenantTables(db)) {
        const policies = await db.query(
          `select 1 from pg_policies where schemaname = 'public' and tablename = $1 and cmd in ('SELECT', 'ALL')`,
          [table],
        );
        expect(policies.rowCount, `${table} needs a select policy`).toBeGreaterThan(0);

        const indexes = await db.query(
          `select 1 from pg_index i
             join pg_class t on t.oid = i.indrelid
             join pg_namespace n on n.oid = t.relnamespace
             join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
            where n.nspname = 'public' and t.relname = $1 and a.attname = 'tenant_id'`,
          [table],
        );
        expect(indexes.rowCount, `${table} needs an index starting with tenant_id`).toBeGreaterThan(
          0,
        );
      }
    });
  });

  it('every table has created_at/updated_at and keeps updated_at current', async () => {
    await inRollback(async (db) => {
      for (const table of await listPublicTables(db)) {
        const cols = await db.query<{ column_name: string }>(
          `select column_name from information_schema.columns
            where table_schema = 'public' and table_name = $1 and column_name in ('created_at', 'updated_at')`,
          [table],
        );
        expect(cols.rowCount, `${table} needs created_at and updated_at`).toBe(2);
        if ((APPEND_ONLY_TABLES as readonly string[]).includes(table)) continue;
        const trigger = await db.query(
          `select 1 from information_schema.triggers
            where event_object_schema = 'public' and event_object_table = $1 and trigger_name = 'set_updated_at'`,
          [table],
        );
        expect(trigger.rowCount, `${table} needs the set_updated_at trigger`).toBeGreaterThan(0);
      }
    });
  });

  it('the anon role has no privileges on public tables', async () => {
    await inRollback(async (db) => {
      const { rows } = await db.query<{ table_name: string }>(
        `select distinct table_name from information_schema.role_table_grants
          where table_schema = 'public' and grantee = 'anon'`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([]);
    });
  });
});

describeDb('functions exposed through the API', () => {
  afterAll(closePool);

  /** Functions in public that panel users may call via RPC. Everything else is service-role only. */
  const USER_CALLABLE: string[] = [];

  it('no public function is executable by anon or authenticated unless allow-listed', async () => {
    await inRollback(async (db) => {
      const { rows } = await db.query<{ name: string; role: string }>(
        `select p.proname as name, r.rolname as role
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           cross join (values ('anon'), ('authenticated')) as r (rolname)
          where n.nspname = 'public'
            and has_function_privilege(r.rolname, p.oid, 'execute')`,
      );
      const exposed = rows.filter((r) => r.role === 'anon' || !USER_CALLABLE.includes(r.name));
      expect(exposed.map((r) => `${r.name} (${r.role})`)).toEqual([]);
    });
  });
});
