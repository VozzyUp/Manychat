import { randomUUID } from 'node:crypto';
import type { Db } from './pg';
import type { World } from './world';

/**
 * How to insert one row of each tenant-scoped table for a given tenant.
 * The isolation test runs this as a user of tenant A targeting tenant B (must be refused).
 *
 * Every table with a tenant_id column MUST have an entry here: the catalog test fails otherwise,
 * so a new table cannot ship without its RLS isolation test (CLAUDE.md rule 1).
 */
export const TABLE_FIXTURES: Record<
  string,
  (db: Db, world: World, tenantId: string) => Promise<unknown>
> = {
  tenant_members: async (db, world, tenantId) =>
    db.query(`insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'viewer')`, [
      tenantId,
      world.users.outsider,
    ]),
  tenant_modules: async (db, _world, tenantId) =>
    db.query(`insert into tenant_modules (tenant_id, module) values ($1, 'adm')`, [tenantId]),
  departments: async (db, _world, tenantId) =>
    db.query(`insert into departments (tenant_id, name) values ($1, $2)`, [
      tenantId,
      `Dept ${randomUUID().slice(0, 6)}`,
    ]),
  audit_log: async (db, _world, tenantId) =>
    db.query(
      `insert into audit_log (tenant_id, action, entity, entity_id) values ($1, 'insert', 'test', $2)`,
      [tenantId, randomUUID()],
    ),
};
