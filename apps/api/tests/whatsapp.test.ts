import { randomInt } from 'node:crypto';
import { signWebhookBody } from '@nurion/whatsapp';
import { textMessage } from '@nurion/whatsapp/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildTestApp, TEST_APP_SECRET, TEST_VERIFY_TOKEN } from './helpers/app';
import { describeStack, sql } from './helpers/stack';
import { createApiWorld, type ApiWorld } from './helpers/world';

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

/** Fake Graph API: token "EAAG-valid…" is accepted, anything else is rejected with code 190. */
const graph = {
  version: 'v23.0',
  fetch: (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const auth = new Headers(init.headers).get('authorization') ?? '';
    if (!auth.startsWith('Bearer EAAG-valid')) {
      return new Response(
        JSON.stringify({ error: { code: 190, message: 'Invalid OAuth access token' } }),
        { status: 401 },
      );
    }
    if (url.includes('/message_templates')) {
      return Response.json({
        data: [
          {
            id: '11',
            name: 'alerta_temperatura',
            language: 'pt_BR',
            category: 'UTILITY',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Alerta: {{1}} registrou {{2}} na entrega {{3}}.' }],
          },
          {
            id: '12',
            name: 'rota_do_dia',
            language: 'pt_BR',
            category: 'UTILITY',
            status: 'PENDING',
            components: [],
          },
        ],
      });
    }
    return Response.json({
      display_phone_number: '+55 11 4002-8922',
      verified_name: 'Transportadora Demo',
    });
  }) as typeof fetch,
};

describeStack('WhatsApp in the API', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let w: ApiWorld;

  beforeAll(async () => {
    app = await buildTestApp({
      whatsapp: { appSecret: TEST_APP_SECRET, verifyToken: TEST_VERIFY_TOKEN, graph },
    });
    w = await createApiWorld();
  }, 60_000);
  afterAll(async () => {
    await w?.cleanup();
    await app?.close();
  });

  describe('webhook (ESCOPO §4.2)', () => {
    it('answers the Meta verification challenge only with the right token', async () => {
      const ok = await app.inject({
        method: 'GET',
        url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=4242`,
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.body).toBe('4242');
      const bad = await app.inject({
        method: 'GET',
        url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1',
      });
      expect(bad.statusCode).toBe(403);
    });

    it('rejects a wrong signature and enqueues the exact raw body otherwise', async () => {
      const raw = JSON.stringify(textMessage);
      const forged = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhookBody(raw, 'wrong'),
        },
        payload: raw,
      });
      expect(forged.statusCode).toBe(401);
      expect(app.enqueued).toHaveLength(0);

      const before = performance.now();
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhookBody(raw, TEST_APP_SECRET),
        },
        payload: raw,
      });
      expect(res.statusCode).toBe(200);
      expect(performance.now() - before).toBeLessThan(1000);
      expect(app.enqueued).toHaveLength(1);
      expect(app.enqueued[0]!.job.body).toBe(raw);
      expect(app.enqueued[0]!.jobId).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('numbers (S21)', () => {
    const phone = digits(15);

    it('checks the token with Meta, encrypts it and never returns it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-numbers',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: {
          phone_number_id: phone,
          waba_id: '102290129340398',
          access_token: 'EAAG-valid-token-1234567890',
          default_module: 'log',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        display_number: '+55 11 4002-8922',
        token_last4: '7890',
        verified_name: 'Transportadora Demo',
      });
      expect(JSON.stringify(body)).not.toContain('EAAG');
      const [row] = await sql<{ access_token_enc: string }>(
        `select access_token_enc from whatsapp_numbers where id = $1`,
        [body.id],
      );
      expect(row!.access_token_enc).toMatch(/^v1\./);
      expect(app.deps.secrets!.decrypt(row!.access_token_enc)).toBe('EAAG-valid-token-1234567890');
    });

    it('refuses a token Meta rejects, a duplicate number and modules the tenant did not contract', async () => {
      const invalid = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-numbers',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: {
          phone_number_id: digits(15),
          waba_id: '1022901',
          access_token: 'EAAG-revoked-0000000000000',
        },
      });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error.message).toMatch(/Meta/);

      const duplicate = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-numbers',
        headers: as(w.tokens.ownerB, w.tenants.B),
        payload: {
          phone_number_id: phone,
          waba_id: '1022901',
          access_token: 'EAAG-valid-token-0000000000',
        },
      });
      expect(duplicate.statusCode).toBe(409);

      const module = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-numbers',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: {
          phone_number_id: digits(15),
          waba_id: '1022901',
          access_token: 'EAAG-valid-token-0000000000',
          default_module: 'labs',
        },
      });
      expect(module.statusCode).toBe(400);
    });

    it('viewers cannot register numbers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-numbers',
        headers: as(w.tokens.viewer, w.tenants.A),
        payload: {
          phone_number_id: digits(15),
          waba_id: '1022901',
          access_token: 'EAAG-valid-token-0000000000',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('re-checks the stored token and blocks deleting a number with history', async () => {
      const [number] = await sql<{ id: string }>(
        `select id from whatsapp_numbers where phone_number_id = $1`,
        [phone],
      );
      const check = await app.inject({
        method: 'POST',
        url: `/v1/whatsapp-numbers/${number!.id}/check`,
        headers: as(w.tokens.admin, w.tenants.A),
      });
      expect(check.statusCode).toBe(200);
      expect(check.json().verified_at).toBeTruthy();

      const [contact] = await sql<{ id: string }>(
        `insert into contacts (tenant_id, wa_id) values ($1, $2) returning id`,
        [w.tenants.A, `55${digits(11)}`],
      );
      await sql(
        `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3)`,
        [w.tenants.A, contact!.id, number!.id],
      );
      const del = await app.inject({
        method: 'DELETE',
        url: `/v1/whatsapp-numbers/${number!.id}`,
        headers: as(w.tokens.admin, w.tenants.A),
      });
      expect(del.statusCode).toBe(409);

      const disable = await app.inject({
        method: 'PATCH',
        url: `/v1/whatsapp-numbers/${number!.id}`,
        headers: as(w.tokens.admin, w.tenants.A),
        payload: { status: 'disabled' },
      });
      expect(disable.json().status).toBe('disabled');
      await sql(`update whatsapp_numbers set status = 'active' where id = $1`, [number!.id]);
    });
  });

  describe('templates (S22)', () => {
    it('creates a local template and counts its variables', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-templates',
        headers: as(w.tokens.admin, w.tenants.A),
        payload: {
          waba_id: '102290129340398',
          name: 'lembrete_exame',
          category: 'utility',
          body: 'Olá {{1}}, seu exame é {{2}}.',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        variables_count: 2,
        status: 'pending',
        language: 'pt_BR',
      });
    });

    it('syncs names, bodies and approval status from Meta', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/whatsapp-templates/sync',
        headers: as(w.tokens.admin, w.tenants.A),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ synced: 2, wabas: 1 });
      const rows = await sql<{ name: string; status: string; variables_count: number }>(
        `select name, status, variables_count from whatsapp_templates where tenant_id = $1 order by name`,
        [w.tenants.A],
      );
      expect(rows).toEqual(
        expect.arrayContaining([
          { name: 'alerta_temperatura', status: 'approved', variables_count: 3 },
          { name: 'rota_do_dia', status: 'pending', variables_count: 0 },
        ]),
      );
    });
  });
});
