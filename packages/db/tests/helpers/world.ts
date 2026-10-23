import { randomUUID } from 'node:crypto';
import type { Db } from './pg';

/**
 * A small multi-tenant world for RLS tests. Inserted as the connection owner (bypasses RLS),
 * inside a transaction that the test rolls back.
 *
 *   partner P1 ── tenant A   (ownerA, adminA, qualityA, viewerA; modules log, consult)
 *   partner P2 ── tenant B   (ownerB; module labs)
 *   partnerAdmin1 / partnerViewer1 work for P1; outsider belongs to nothing.
 */
export type World = Awaited<ReturnType<typeof createWorld>>;

const USERS = [
  'ownerA',
  'adminA',
  'qualityA',
  'viewerA',
  'ownerB',
  'partnerAdmin1',
  'partnerViewer1',
  'outsider',
] as const;

export async function createWorld(db: Db) {
  const users = Object.fromEntries(USERS.map((name) => [name, randomUUID()])) as Record<
    (typeof USERS)[number],
    string
  >;
  for (const [name, id] of Object.entries(users)) {
    await db.query(
      `insert into auth.users (id, email, aud, role, raw_user_meta_data)
       values ($1, $2, 'authenticated', 'authenticated', $3)`,
      [id, `${name.toLowerCase()}-${id.slice(0, 8)}@test.local`, { full_name: name }],
    );
  }

  const one = async (sql: string, params: unknown[]) =>
    (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

  const p1 = await one(`insert into partners (name) values ('Partner One') returning id`, []);
  const p2 = await one(`insert into partners (name) values ('Partner Two') returning id`, []);
  const tenantA = await one(
    `insert into tenants (partner_id, name, slug) values ($1, 'Tenant A', $2) returning id`,
    [p1, `tenant-a-${randomUUID().slice(0, 8)}`],
  );
  const tenantB = await one(
    `insert into tenants (partner_id, name, slug) values ($1, 'Tenant B', $2) returning id`,
    [p2, `tenant-b-${randomUUID().slice(0, 8)}`],
  );

  const member = (tenant: string, user: string, role: string) =>
    db.query(`insert into tenant_members (tenant_id, user_id, role) values ($1, $2, $3)`, [
      tenant,
      user,
      role,
    ]);
  await member(tenantA, users.ownerA, 'owner');
  await member(tenantA, users.adminA, 'admin');
  await member(tenantA, users.qualityA, 'quality');
  await member(tenantA, users.viewerA, 'viewer');
  await member(tenantB, users.ownerB, 'owner');

  await db.query(
    `insert into partner_members (partner_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'viewer')`,
    [p1, users.partnerAdmin1, users.partnerViewer1],
  );

  await db.query(
    `insert into tenant_modules (tenant_id, module) values ($1, 'log'), ($1, 'consult'), ($2, 'labs')`,
    [tenantA, tenantB],
  );
  const deptA = await one(
    `insert into departments (tenant_id, name) values ($1, 'Qualidade') returning id`,
    [tenantA],
  );
  const deptB = await one(
    `insert into departments (tenant_id, name) values ($1, 'Financeiro') returning id`,
    [tenantB],
  );

  return { users, partners: { p1, p2 }, tenants: { A: tenantA, B: tenantB }, deptA, deptB };
}
