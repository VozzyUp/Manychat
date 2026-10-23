import type { Db } from './pg';

/** Tables that are not owned by a single tenant (ESCOPO §9: partners/tenants; plus auth-linked tables). */
export const GLOBAL_TABLES = ['partners', 'partner_members', 'profiles', 'tenants'] as const;

/** Append-only tables: no updated_at trigger needed. */
export const APPEND_ONLY_TABLES = ['audit_log'] as const;

export async function listPublicTables(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return rows.map((r) => r.tablename);
}

export async function listTenantTables(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `select c.table_name
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'
      order by c.table_name`,
  );
  return rows.map((r) => r.table_name);
}
