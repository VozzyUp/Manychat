import { describe, expect, it } from 'vitest';
import { createServiceDb } from './clients';
import { createTenantFetch, TenantScopeError } from './tenant-fetch';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

type Captured = { url: URL; method: string; body: unknown };

/** A service db whose HTTP calls are captured instead of sent. */
function harness() {
  const calls: Captured[] = [];
  const violations: string[] = [];
  const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const db = createServiceDb({
    url: 'http://supabase.test',
    serviceRoleKey: 'service-key',
    fetch: fakeFetch,
    onTenantViolation: (error) => violations.push(error.message),
  });
  return { db, calls, violations, last: () => calls.at(-1)! };
}

/** A violation never reaches the network and comes back as a 403 error result. */
async function expectBlocked(
  h: ReturnType<typeof harness>,
  query: PromiseLike<{ error: unknown }>,
  pattern: RegExp = /withTenant/,
) {
  const before = h.calls.length;
  const { error } = await query;
  expect(error).toBeTruthy();
  expect(String((error as { message?: string }).message)).toMatch(pattern);
  expect(h.calls.length).toBe(before);
  expect(h.violations.at(-1)).toMatch(pattern);
}

describe('withTenant (service role pinned to one tenant)', () => {
  it('adds the tenant filter to selects, updates and deletes', async () => {
    const { db, last } = harness();
    const scoped = db.withTenant(A);
    expect(scoped.tenantId).toBe(A);

    await scoped.from('departments').select('id, name').eq('name', 'RH');
    expect(last().url.searchParams.get('tenant_id')).toBe(`eq.${A}`);
    expect(last().url.searchParams.get('name')).toBe('eq.RH');

    await scoped.from('departments').update({ name: 'X' }).eq('id', A);
    expect(last().method).toBe('PATCH');
    expect(last().url.searchParams.get('tenant_id')).toBe(`eq.${A}`);

    await scoped.from('departments').delete().eq('id', A);
    expect(last().method).toBe('DELETE');
    expect(last().url.searchParams.get('tenant_id')).toBe(`eq.${A}`);
  });

  it('refuses a filter for another tenant', async () => {
    const h = harness();
    await expectBlocked(h, h.db.withTenant(A).from('departments').select('id').eq('tenant_id', B));
  });

  it('stamps tenant_id on inserted rows (single, bulk and upsert)', async () => {
    const { db, last } = harness();
    const scoped = db.withTenant(A);

    await scoped.from('departments').insert({ name: 'RH' } as never);
    expect(last().body).toEqual({ name: 'RH', tenant_id: A });

    await scoped.from('departments').insert([{ name: 'RH' }, { name: 'TI' }] as never);
    expect(last().body).toEqual([
      { name: 'RH', tenant_id: A },
      { name: 'TI', tenant_id: A },
    ]);
    // PostgREST only writes the columns listed in ?columns=; tenant_id must be among them.
    const columns = last().url.searchParams.get('columns');
    if (columns) expect(columns).toContain('tenant_id');

    await scoped
      .from('departments')
      .upsert({ name: 'RH' } as never, { onConflict: 'tenant_id,name' });
    expect(last().body).toEqual({ name: 'RH', tenant_id: A });
  });

  it('refuses rows for another tenant and moving rows between tenants', async () => {
    const h = harness();
    const scoped = h.db.withTenant(A);
    await expectBlocked(h, scoped.from('departments').insert({ tenant_id: B, name: 'RH' }));
    await expectBlocked(
      h,
      scoped.from('departments').insert([
        { tenant_id: A, name: 'ok' },
        { tenant_id: B, name: 'no' },
      ]),
    );
    await expectBlocked(h, scoped.from('departments').update({ tenant_id: B }).eq('id', A));
  });

  it('injects p_tenant_id into rpc calls and refuses another tenant', async () => {
    const h = harness();
    const scoped = h.db.withTenant(A);
    await scoped.rpc('some_function' as never, { q: 'x' } as never);
    expect(h.last().body).toEqual({ q: 'x', p_tenant_id: A });
    await expectBlocked(h, scoped.rpc('some_function' as never, { p_tenant_id: B } as never));
  });

  it('refuses global tables', async () => {
    const h = harness();
    for (const table of ['tenants', 'partners', 'partner_members', 'profiles'] as const) {
      await expectBlocked(h, h.db.withTenant(A).from(table).select('id'), /global/);
    }
  });

  it('keeps storage inside the tenant folder', async () => {
    const h = harness();
    const storage = h.db.withTenant(A).storage.from('media');

    await storage.createSignedUrl(`${A}/2026/10/wamid.jpg`, 60);
    expect(h.last().url.pathname).toContain(`/media/${A}/2026/10/wamid.jpg`);
    await storage.list(`${A}/2026`);
    await storage.remove([`${A}/2026/10/wamid.jpg`]);
    expect(h.last().method).toBe('DELETE');
    await storage.upload(`${A}/2026/10/doc.pdf`, new Blob(['x']));

    await expectBlocked(h, storage.createSignedUrl(`${B}/2026/10/wamid.jpg`, 60));
    await expectBlocked(h, storage.download(`${B}/x.pdf`));
    await expectBlocked(h, storage.list(B));
    await expectBlocked(h, storage.remove([`${B}/x.pdf`]));
    await expectBlocked(h, storage.upload(`${B}/x.pdf`, new Blob(['x'])));
  });

  it('refuses auth admin and unknown endpoints', async () => {
    const tenantFetch = createTenantFetch(
      A,
      async () => new Response('{}'),
      () => undefined,
    );
    const res = await tenantFetch('http://supabase.test/auth/v1/admin/users');
    expect(res.status).toBe(403);
  });

  it('rejects an invalid tenant id up front', () => {
    expect(() => createTenantFetch('not-a-uuid')).toThrow(TenantScopeError);
  });
});
