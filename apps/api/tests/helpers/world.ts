import { randomUUID } from 'node:crypto';
import { createUser, deleteUsers, signIn, sql } from './stack';

/**
 * Two tenants of one partner, with users of every relevant role, signed in for real.
 *   tenant A: owner, admin, viewer      tenant B: ownerB      outsider: no tenant
 */
export async function createApiWorld() {
  const [owner, admin, viewer, ownerB, outsider] = await Promise.all(
    ['owner', 'admin', 'viewer', 'ownerb', 'outsider'].map((n) => createUser(n)),
  );
  const [partner] = await sql<{ id: string }>(
    `insert into partners (name, branding) values ('Parceiro Teste', '{"primary":"#123456","name":"Marca Parceiro"}') returning id`,
  );
  const slug = () => `t-${randomUUID().slice(0, 12)}`;
  const [tenantA] = await sql<{ id: string }>(
    `insert into tenants (partner_id, name, slug) values ($1, 'Empresa A', $2) returning id`,
    [partner!.id, slug()],
  );
  const [tenantB] = await sql<{ id: string }>(
    `insert into tenants (partner_id, name, slug) values ($1, 'Empresa B', $2) returning id`,
    [partner!.id, slug()],
  );
  await sql(
    `insert into tenant_members (tenant_id, user_id, role) values
       ($1, $3, 'owner'), ($1, $4, 'admin'), ($1, $5, 'viewer'), ($2, $6, 'owner')`,
    [tenantA!.id, tenantB!.id, owner!.id, admin!.id, viewer!.id, ownerB!.id],
  );
  await sql(`insert into tenant_modules (tenant_id, module) values ($1, 'log'), ($1, 'consult')`, [
    tenantA!.id,
  ]);

  const tokens = {
    owner: await signIn(owner!.email),
    admin: await signIn(admin!.email),
    viewer: await signIn(viewer!.email),
    ownerB: await signIn(ownerB!.email),
    outsider: await signIn(outsider!.email),
  };
  const users = {
    owner: owner!,
    admin: admin!,
    viewer: viewer!,
    ownerB: ownerB!,
    outsider: outsider!,
  };

  return {
    users,
    tokens,
    partnerId: partner!.id,
    tenants: { A: tenantA!.id, B: tenantB!.id },
    extraUserIds: [] as string[],
    async cleanup() {
      await sql(`delete from tenants where id = any($1::uuid[])`, [[tenantA!.id, tenantB!.id]]);
      await sql(`delete from partners where id = $1`, [partner!.id]);
      await deleteUsers([...Object.values(users).map((u) => u.id), ...this.extraUserIds]);
    },
  };
}

export type ApiWorld = Awaited<ReturnType<typeof createApiWorld>>;
