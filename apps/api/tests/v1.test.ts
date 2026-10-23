import { contrastRatio } from '@nurion/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/server';
import { as, buildTestApp, multipartFile, PNG_1PX } from './helpers/app';
import { describeStack, signIn, sql } from './helpers/stack';
import { createApiWorld, type ApiWorld } from './helpers/world';

describeStack('API /v1 against the local Supabase stack', () => {
  let app: App;
  let w: ApiWorld;

  beforeAll(async () => {
    app = await buildTestApp();
    w = await createApiWorld();
  }, 60_000);

  afterAll(async () => {
    await w?.cleanup();
    await app?.close();
  });

  describe('authentication', () => {
    it('refuses requests without a valid token', async () => {
      expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
      const forged = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(forged.statusCode).toBe(401);
      expect(forged.json().error.code).toBe('unauthenticated');
    });

    it('GET /v1/me lists only my tenants, with branding and modules', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me', headers: as(w.tokens.owner) });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.id).toBe(w.users.owner.id);
      expect(body.tenants).toHaveLength(1);
      expect(body.tenants[0]).toMatchObject({
        role: 'owner',
        tenant: {
          id: w.tenants.A,
          modules: ['log', 'consult'],
          branding: { accent: '#123456', productName: 'Marca Parceiro' },
        },
      });

      const outsider = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: as(w.tokens.outsider),
      });
      expect(outsider.json().tenants).toEqual([]);
    });
  });

  describe('tenant context', () => {
    it('requires a valid x-tenant-id of a tenant I belong to', async () => {
      const missing = await app.inject({
        method: 'GET',
        url: '/v1/tenant',
        headers: as(w.tokens.owner),
      });
      expect(missing.statusCode).toBe(400);
      const other = await app.inject({
        method: 'GET',
        url: '/v1/tenant',
        headers: as(w.tokens.owner, w.tenants.B),
      });
      expect(other.statusCode).toBe(403);
      const mine = await app.inject({
        method: 'GET',
        url: '/v1/tenant',
        headers: as(w.tokens.owner, w.tenants.A),
      });
      expect(mine.statusCode).toBe(200);
      expect(mine.json().id).toBe(w.tenants.A);
    });

    it('blocks suspended tenants', async () => {
      await sql(`update tenants set status = 'suspended' where id = $1`, [w.tenants.B]);
      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenant',
        headers: as(w.tokens.ownerB, w.tenants.B),
      });
      expect(res.statusCode).toBe(403);
      await sql(`update tenants set status = 'active' where id = $1`, [w.tenants.B]);
    });
  });

  describe('PATCH /v1/tenant (white-label)', () => {
    it('admins change name, brand colour and settings; colours stay readable', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/tenant',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: {
          name: 'Empresa A Ltda',
          branding: { primary: '#FDE047', name: 'Marca A' },
          settings: { timezone: 'America/Manaus', business_hours: 'Seg–Sex 8h–18h' },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Empresa A Ltda');
      expect(body.settings).toMatchObject({
        timezone: 'America/Manaus',
        business_hours: 'Seg–Sex 8h–18h',
      });
      const b = body.resolved_branding;
      expect(b).toMatchObject({ accent: '#fde047', productName: 'Marca A' });
      expect(contrastRatio(b.onAccent, b.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(b.accentText, '#ffffff')).toBeGreaterThanOrEqual(4.5);

      const [audit] = await sql<{ user_id: string }>(
        `select user_id from audit_log where entity = 'tenants' and entity_id = $1 and action = 'update'
          order by created_at desc limit 1`,
        [w.tenants.A],
      );
      expect(audit?.user_id).toBe(w.users.admin.id);
    });

    it('null removes a branding key (back to the partner colour)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/tenant',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { branding: { primary: null } },
      });
      expect(res.json().resolved_branding.accent).toBe('#123456');
    });

    it('validates input', async () => {
      for (const payload of [
        { branding: { primary: 'vermelho' } },
        { settings: { timezone: 'Mars/Olympus' } },
        { name: 'x' },
      ]) {
        const res = await app.inject({
          method: 'PATCH',
          url: '/v1/tenant',
          headers: as(w.tokens.admin, w.tenants.A),
          payload,
        });
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
    });

    it('viewers cannot change settings', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/tenant',
        headers: as(w.tokens.viewer, w.tenants.A),
        payload: { name: 'Hacked' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('logo upload', () => {
    it('stores a PNG in the tenant folder and publishes its URL', async () => {
      const { payload, headers } = multipartFile('file', 'logo.png', 'image/png', PNG_1PX);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenant/logo',
        headers: { ...as(w.tokens.admin, w.tenants.A), ...headers },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const url = res.json().resolved_branding.logoUrl as string;
      expect(url).toContain(`/branding/${w.tenants.A}/logo-`);
      const image = await fetch(url);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toContain('image/png');
    });

    it('rejects other types, fake PNGs and big files', async () => {
      const cases = [
        multipartFile('file', 'logo.svg', 'image/svg+xml', Buffer.from('<svg/>')),
        multipartFile('file', 'logo.png', 'image/png', Buffer.from('not really a png')),
      ];
      for (const { payload, headers } of cases) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/tenant/logo',
          headers: { ...as(w.tokens.admin, w.tenants.A), ...headers },
          payload,
        });
        expect(res.statusCode).toBe(400);
      }
      const big = multipartFile(
        'file',
        'big.png',
        'image/png',
        Buffer.concat([PNG_1PX, Buffer.alloc(1_100_000)]),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenant/logo',
        headers: { ...as(w.tokens.admin, w.tenants.A), ...big.headers },
        payload: big.payload,
      });
      expect(res.statusCode).toBe(413);
    });
  });

  describe('members', () => {
    it('admins invite new people by e-mail and add existing users', async () => {
      const email = `convidado-${Date.now()}@test.local`;
      const invited = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { email, role: 'operator' },
      });
      expect(invited.statusCode).toBe(201);
      expect(invited.json()).toMatchObject({ role: 'operator', invited: true });
      w.extraUserIds.push(invited.json().user_id);

      const existing = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { email: w.users.outsider.email, role: 'viewer' },
      });
      expect(existing.statusCode).toBe(201);
      expect(existing.json().invited).toBe(false);

      const again = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { email: w.users.outsider.email, role: 'viewer' },
      });
      expect(again.statusCode).toBe(409);
    });

    it('only owners grant owner; the last owner cannot be demoted', async () => {
      const [viewerRow] = await sql<{ id: string }>(
        `select id from tenant_members where tenant_id = $1 and user_id = $2`,
        [w.tenants.A, w.users.viewer.id],
      );
      const byAdmin = await app.inject({
        method: 'PATCH',
        url: `/v1/members/${viewerRow!.id}`,
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { role: 'owner' },
      });
      expect(byAdmin.statusCode).toBe(403);

      const [ownerRow] = await sql<{ id: string }>(
        `select id from tenant_members where tenant_id = $1 and user_id = $2`,
        [w.tenants.A, w.users.owner.id],
      );
      const demoteLast = await app.inject({
        method: 'PATCH',
        url: `/v1/members/${ownerRow!.id}`,
        headers: as(w.tokens.owner, w.tenants.A),
        payload: { role: 'admin' },
      });
      expect(demoteLast.statusCode).toBe(409);
      expect(demoteLast.json().error.message).toMatch(/owner/);

      const promote = await app.inject({
        method: 'PATCH',
        url: `/v1/members/${viewerRow!.id}`,
        headers: as(w.tokens.owner, w.tenants.A),
        payload: { role: 'manager' },
      });
      expect(promote.statusCode).toBe(200);
      expect(promote.json().role).toBe('manager');
    });

    it('viewers cannot manage members; members of B are out of reach', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/members',
        headers: as(w.tokens.viewer, w.tenants.A),
        payload: { email: 'x@test.local', role: 'viewer' },
      });
      expect(res.statusCode).toBe(403);

      const [rowB] = await sql<{ id: string }>(
        `select id from tenant_members where tenant_id = $1`,
        [w.tenants.B],
      );
      const cross = await app.inject({
        method: 'DELETE',
        url: `/v1/members/${rowB!.id}`,
        headers: as(w.tokens.owner, w.tenants.A),
      });
      expect(cross.statusCode).toBe(404);
    });
  });

  describe('departments', () => {
    it('admins create, rename and delete; duplicates conflict; viewers are refused', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/departments',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { name: 'Qualidade' },
      });
      expect(created.statusCode).toBe(201);
      const dup = await app.inject({
        method: 'POST',
        url: '/v1/departments',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { name: 'Qualidade' },
      });
      expect(dup.statusCode).toBe(409);
      const viewer = await app.inject({
        method: 'POST',
        url: '/v1/departments',
        headers: as(w.tokens.viewer, w.tenants.A),
        payload: { name: 'RH' },
      });
      expect(viewer.statusCode).toBe(403);

      const id = created.json().id as string;
      const renamed = await app.inject({
        method: 'PATCH',
        url: `/v1/departments/${id}`,
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { name: 'Qualidade e Regulatório' },
      });
      expect(renamed.json().name).toBe('Qualidade e Regulatório');
      const fromB = await app.inject({
        method: 'DELETE',
        url: `/v1/departments/${id}`,
        headers: as(w.tokens.ownerB, w.tenants.B),
      });
      expect(fromB.statusCode).toBe(404);
      const removed = await app.inject({
        method: 'DELETE',
        url: `/v1/departments/${id}`,
        headers: as(w.tokens.admin, w.tenants.A),
      });
      expect(removed.statusCode).toBe(204);
    });
  });

  describe('2FA', () => {
    it('a user with 2FA enrolled cannot use a password-only session', async () => {
      await sql(
        `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
         values (gen_random_uuid(), $1, 'app', 'totp', 'verified', now(), now(), 'x')`,
        [w.users.viewer.id],
      );
      const token = await signIn(w.users.viewer.email);
      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenant',
        headers: as(token, w.tenants.A),
      });
      expect(res.statusCode).toBe(403);
      const me = await app.inject({ method: 'GET', url: '/v1/me', headers: as(token) });
      expect(me.json().tenants).toEqual([]);
    });
  });
});
