import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { as, buildTestApp } from './helpers/app';
import { describeStack, sql, stack } from './helpers/stack';
import { createApiWorld, type ApiWorld } from './helpers/world';

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

describeStack('contacts, anonymization and handoff close', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let w: ApiWorld;
  beforeAll(async () => {
    app = await buildTestApp();
    w = await createApiWorld();
  }, 60_000);
  afterAll(async () => {
    await w?.cleanup();
    await app?.close();
  });

  it('creates contacts from a typed phone (canonical id) and refuses duplicates and bad numbers', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/contacts',
      headers: as(w.tokens.admin, w.tenants.A),
      payload: { phone: '(11) 8765-4321', name: 'João Motorista', kind: 'driver' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ wa_id: '5511987654321', kind: 'driver' });

    const dup = await app.inject({
      method: 'POST',
      url: '/v1/contacts',
      headers: as(w.tokens.admin, w.tenants.A),
      payload: { phone: '+55 11 98765-4321' },
    });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/contacts',
      headers: as(w.tokens.admin, w.tenants.A),
      payload: { phone: '12345678x' },
    });
    expect(bad.statusCode).toBe(400);
    const viewer = await app.inject({
      method: 'POST',
      url: '/v1/contacts',
      headers: as(w.tokens.viewer, w.tenants.A),
      payload: { phone: '11999990000' },
    });
    expect(viewer.statusCode).toBe(403);
  });

  it('changes the kind (routing) and keeps tenants apart', async () => {
    const [contact] = await sql<{ id: string }>(
      `insert into contacts (tenant_id, wa_id) values ($1, $2) returning id`,
      [w.tenants.A, `55${digits(11)}`],
    );
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/contacts/${contact!.id}`,
      headers: as(w.tokens.admin, w.tenants.A),
      payload: { kind: 'staff', name: 'Ana' },
    });
    expect(res.json()).toMatchObject({ kind: 'staff', name: 'Ana' });
    const other = await app.inject({
      method: 'PATCH',
      url: `/v1/contacts/${contact!.id}`,
      headers: as(w.tokens.ownerB, w.tenants.B),
      payload: { kind: 'driver' },
    });
    expect(other.statusCode).toBe(404);
  });

  it('anonymizes a contact on request: data, messages and media files are gone', async () => {
    const [number] = await sql<{ id: string }>(
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '1022901', '+55 11 4002-8922', 'v1.x') returning id`,
      [w.tenants.A, digits(15)],
    );
    const [contact] = await sql<{ id: string }>(
      `insert into contacts (tenant_id, wa_id, name) values ($1, $2, 'Maria Paciente') returning id`,
      [w.tenants.A, `55${digits(11)}`],
    );
    const [conv] = await sql<{ id: string }>(
      `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3) returning id`,
      [w.tenants.A, contact!.id, number!.id],
    );
    const [msg] = await sql<{ id: string }>(
      `insert into messages (tenant_id, conversation_id, wamid, direction, type, text) values ($1, $2, $3, 'in', 'image', 'meu pedido') returning id`,
      [w.tenants.A, conv!.id, `wamid.${digits(16)}`],
    );
    const path = `${w.tenants.A}/2026/10/anon-${digits(6)}.jpg`;
    await app.deps.serviceDb
      .withTenant(w.tenants.A)
      .storage.from('media')
      .upload(path, Buffer.from('jpg'), { contentType: 'image/jpeg' });
    await sql(
      `insert into message_media (tenant_id, message_id, storage_path, status) values ($1, $2, $3, 'stored')`,
      [w.tenants.A, msg!.id, path],
    );

    // Someone else's photo in the same tenant must survive.
    const [other] = await sql<{ id: string }>(
      `insert into contacts (tenant_id, wa_id, name) values ($1, $2, 'Outra Pessoa') returning id`,
      [w.tenants.A, `55${digits(11)}`],
    );
    const [otherConv] = await sql<{ id: string }>(
      `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3) returning id`,
      [w.tenants.A, other!.id, number!.id],
    );
    const [otherMsg] = await sql<{ id: string }>(
      `insert into messages (tenant_id, conversation_id, wamid, direction, type) values ($1, $2, $3, 'in', 'image') returning id`,
      [w.tenants.A, otherConv!.id, `wamid.${digits(16)}`],
    );
    const otherPath = `${w.tenants.A}/2026/10/keep-${digits(6)}.jpg`;
    await app.deps.serviceDb
      .withTenant(w.tenants.A)
      .storage.from('media')
      .upload(otherPath, Buffer.from('jpg'), { contentType: 'image/jpeg' });
    await sql(
      `insert into message_media (tenant_id, message_id, storage_path, status) values ($1, $2, $3, 'stored')`,
      [w.tenants.A, otherMsg!.id, otherPath],
    );

    const operator = await app.inject({
      method: 'POST',
      url: `/v1/contacts/${contact!.id}/anonymize`,
      headers: as(w.tokens.viewer, w.tenants.A),
    });
    expect(operator.statusCode).toBe(403);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/contacts/${contact!.id}/anonymize`,
      headers: as(w.tokens.admin, w.tenants.A),
    });
    expect(res.json()).toEqual({ anonymized: true, removed_files: 1 });
    const [after] = await sql<{ name: string | null }>(`select name from contacts where id = $1`, [
      contact!.id,
    ]);
    expect(after!.name).toBeNull();
    const [m] = await sql<{ text: string | null }>(`select text from messages where id = $1`, [
      msg!.id,
    ]);
    expect(m!.text).toBeNull();
    const download = await fetch(`${stack.url}/storage/v1/object/media/${path}`, {
      headers: { authorization: `Bearer ${stack.serviceKey}`, apikey: stack.serviceKey },
    });
    expect(download.status).toBe(400);
    const kept = await fetch(`${stack.url}/storage/v1/object/media/${otherPath}`, {
      headers: { authorization: `Bearer ${stack.serviceKey}`, apikey: stack.serviceKey },
    });
    expect(kept.status).toBe(200);
    const [otherRow] = await sql<{ name: string | null }>(
      `select name from contacts where id = $1`,
      [other!.id],
    );
    expect(otherRow!.name).toBe('Outra Pessoa');

    const again = await app.inject({
      method: 'PATCH',
      url: `/v1/contacts/${contact!.id}`,
      headers: as(w.tokens.admin, w.tenants.A),
      payload: { name: 'x' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('closes an open human handoff so the AI answers again', async () => {
    const [number] = await sql<{ id: string }>(
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '1022901', '+55 11 4002-8922', 'v1.x') returning id`,
      [w.tenants.A, digits(15)],
    );
    const [contact] = await sql<{ id: string }>(
      `insert into contacts (tenant_id, wa_id) values ($1, $2) returning id`,
      [w.tenants.A, `55${digits(11)}`],
    );
    const [conv] = await sql<{ id: string }>(
      `insert into conversations (tenant_id, contact_id, whatsapp_number_id) values ($1, $2, $3) returning id`,
      [w.tenants.A, contact!.id, number!.id],
    );
    await sql(
      `insert into handoffs (tenant_id, conversation_id, reason) values ($1, $2, 'unidentified')`,
      [w.tenants.A, conv!.id],
    );

    const res = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${conv!.id}/handoff/close`,
      headers: as(w.tokens.admin, w.tenants.A),
    });
    expect(res.json()).toEqual({ closed: 1 });
    const [h] = await sql<{ status: string; closed_by_user_id: string }>(
      `select status, closed_by_user_id from handoffs where conversation_id = $1`,
      [conv!.id],
    );
    expect(h).toEqual({ status: 'closed', closed_by_user_id: w.users.admin.id });
    const none = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${conv!.id}/handoff/close`,
      headers: as(w.tokens.admin, w.tenants.A),
    });
    expect(none.statusCode).toBe(404);
  });
});
