import { GLOBAL_TABLES } from './types';

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(`withTenant: ${message}`);
    this.name = 'TenantScopeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const globalTables = new Set<string>(GLOBAL_TABLES);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * A fetch that pins every Supabase request of a service-role client to one tenant
 * (CLAUDE.md rule 1, ADR-0001). It works at the HTTP layer, so the client keeps its full typing
 * and a query cannot "forget" the tenant filter:
 *
 * - PostgREST reads/updates/deletes get `tenant_id=eq.<tenant>`; a filter for another tenant throws.
 * - Inserts/upserts get `tenant_id` set on every row; a row for another tenant throws.
 * - Updates cannot move rows to another tenant.
 * - RPC calls get `p_tenant_id`; a different value throws.
 * - Global tables (tenants, partners, ...) and Auth admin endpoints are refused.
 * - Storage object paths must start with `<tenant>/`.
 */
export function createTenantFetch(
  tenantId: string,
  baseFetch: FetchLike = fetch,
  onViolation: (error: TenantScopeError) => void = (error) => console.error(error.message),
): FetchLike {
  if (!UUID.test(tenantId)) throw new TenantScopeError(`invalid tenant id "${tenantId}"`);

  const guarded: FetchLike = async (input, init = {}) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request ? request.url : input instanceof URL ? input.href : input);
    const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
    let body = init.body;
    const path = url.pathname;

    if (path.startsWith('/rest/v1/rpc/')) {
      const args = parseJsonBody(body, {}) as Record<string, unknown>;
      if ('p_tenant_id' in args && args.p_tenant_id !== tenantId) {
        throw new TenantScopeError(`rpc called with another tenant (${String(args.p_tenant_id)})`);
      }
      body = JSON.stringify({ ...args, p_tenant_id: tenantId });
    } else if (path.startsWith('/rest/v1/')) {
      const table = decodeURIComponent(path.slice('/rest/v1/'.length).split('/')[0] ?? '');
      if (globalTables.has(table)) {
        throw new TenantScopeError(
          `table "${table}" is global; use the named functions in db.system`,
        );
      }
      if (['GET', 'HEAD', 'PATCH', 'DELETE'].includes(method)) {
        pinTenantFilter(url, tenantId);
      }
      if (method === 'POST') {
        body = JSON.stringify(stampRows(parseJsonBody(body, null), tenantId));
        const columns = url.searchParams.get('columns');
        if (columns && !columns.split(',').map(unquote).includes('tenant_id')) {
          url.searchParams.set('columns', `${columns},"tenant_id"`);
        }
      }
      if (method === 'PATCH') {
        const patch = parseJsonBody(body, {}) as Record<string, unknown>;
        if ('tenant_id' in patch && patch.tenant_id !== tenantId) {
          throw new TenantScopeError('rows cannot be moved to another tenant');
        }
      }
    } else if (path.startsWith('/storage/v1/object/')) {
      checkStoragePath(path, body, tenantId);
    } else {
      throw new TenantScopeError(`endpoint not allowed for a tenant-scoped client: ${path}`);
    }

    return baseFetch(url.toString(), { ...init, method, body });
  };

  // supabase-js turns thrown fetch errors into retries (GET) or generic errors, so a violation is
  // answered locally with a 403 that never reaches the database and is not retried.
  return async (input, init) => {
    try {
      return await guarded(input, init);
    } catch (error) {
      if (!(error instanceof TenantScopeError)) throw error;
      onViolation(error);
      return new Response(
        JSON.stringify({
          code: 'tenant_scope',
          message: error.message,
          details: null,
          hint: null,
          error: 'tenant_scope',
          statusCode: '403',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
  };
}

function unquote(column: string): string {
  return column.trim().replace(/^"|"$/g, '');
}

function parseJsonBody(body: RequestInit['body'], fallback: unknown): unknown {
  if (body === undefined || body === null || body === '') return fallback;
  if (typeof body !== 'string') throw new TenantScopeError('unexpected non-JSON body');
  return JSON.parse(body) as unknown;
}

function pinTenantFilter(url: URL, tenantId: string): void {
  const expected = `eq.${tenantId}`;
  const filters = url.searchParams.getAll('tenant_id');
  for (const filter of filters) {
    if (filter !== expected) throw new TenantScopeError(`filter for another tenant (${filter})`);
  }
  if (!filters.length) url.searchParams.append('tenant_id', expected);
}

function stampRows(payload: unknown, tenantId: string): unknown {
  const stamp = (row: unknown) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TenantScopeError('insert rows must be objects');
    }
    const record = row as Record<string, unknown>;
    if ('tenant_id' in record && record.tenant_id !== tenantId) {
      throw new TenantScopeError(`row for another tenant (${String(record.tenant_id)})`);
    }
    return { ...record, tenant_id: tenantId };
  };
  return Array.isArray(payload) ? payload.map(stamp) : stamp(payload);
}

/**
 * Storage paths look like /storage/v1/object/<bucket>/<tenant>/..., with optional action segments
 * (sign, public, authenticated, info, upload/sign) before the bucket. List calls carry a prefix in
 * the body; copy/move carry source and destination keys.
 */
function checkStoragePath(path: string, body: RequestInit['body'], tenantId: string): void {
  const rest = path.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent);
  const prefix = `${tenantId}/`;

  if (rest[0] === 'list') {
    const { prefix: listPrefix } = parseJsonBody(body, {}) as { prefix?: string };
    if (!listPrefix || !(`${listPrefix}/`.startsWith(prefix) || listPrefix.startsWith(prefix))) {
      throw new TenantScopeError('storage list must stay inside the tenant folder');
    }
    return;
  }
  if (rest[0] === 'copy' || rest[0] === 'move') {
    const keys = parseJsonBody(body, {}) as { sourceKey?: string; destinationKey?: string };
    for (const key of [keys.sourceKey, keys.destinationKey]) {
      if (!key?.startsWith(prefix))
        throw new TenantScopeError('storage key outside the tenant folder');
    }
    return;
  }
  if (rest.length === 1) {
    // Bulk delete: DELETE /object/<bucket> with { prefixes: [...] }.
    const { prefixes } = parseJsonBody(body, {}) as { prefixes?: string[] };
    if (!prefixes?.length || !prefixes.every((p) => p.startsWith(prefix))) {
      throw new TenantScopeError('storage key outside the tenant folder');
    }
    return;
  }
  if (rest[0] === 'sign' && rest.length === 2) {
    // Batch signing: POST /object/sign/<bucket> with { paths: [...] }.
    const { paths } = parseJsonBody(body, {}) as { paths?: string[] };
    if (!paths?.every((p) => p.startsWith(prefix))) {
      throw new TenantScopeError('storage key outside the tenant folder');
    }
    return;
  }
  const actions = new Set(['sign', 'public', 'authenticated', 'info', 'upload']);
  let i = 0;
  while (actions.has(rest[i] ?? '')) i += 1;
  if (rest[i - 1] === 'upload' && rest[i] === 'sign') i += 1;
  const objectPath = rest.slice(i + 1).join('/');
  if (!objectPath.startsWith(prefix)) {
    throw new TenantScopeError(
      `storage path outside the tenant folder: ${objectPath || '(empty)'}`,
    );
  }
}
