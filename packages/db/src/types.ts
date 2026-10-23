import type { Database, Tables, TablesInsert, TablesUpdate } from './database.types';

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types';

export type TableName = keyof Database['public']['Tables'];

/** Tables that belong to one tenant (have a tenant_id column). */
export type TenantTableName = {
  [K in TableName]: Tables<K> extends { tenant_id: string } ? K : never;
}[TableName];

export type Row<T extends TableName> = Tables<T>;
export type Insert<T extends TableName> = TablesInsert<T>;
export type Update<T extends TableName> = TablesUpdate<T>;
export type AppRole = Database['public']['Enums']['app_role'];

/** Tables without tenant_id. Workers reach them only through named functions in `system`. */
export const GLOBAL_TABLES = ['partners', 'partner_members', 'profiles', 'tenants'] as const;
