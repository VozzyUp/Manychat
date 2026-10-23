/**
 * Helpers for integration tests that need the local Supabase stack (never used in production code).
 * Connection details come from env, falling back to `supabase status`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export type LocalStack = { url: string; anonKey: string; serviceKey: string; dbUrl: string };

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function discover(): LocalStack | null {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      serviceKey: SUPABASE_SERVICE_ROLE_KEY,
      dbUrl: DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    };
  }
  try {
    const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    });
    const json = JSON.parse(out) as Record<string, string>;
    if (!json.API_URL || !json.ANON_KEY || !json.SERVICE_ROLE_KEY) return null;
    return {
      url: json.API_URL,
      anonKey: json.ANON_KEY,
      serviceKey: json.SERVICE_ROLE_KEY,
      dbUrl: json.DB_URL!,
    };
  } catch {
    return null;
  }
}

/** Finds the local stack; skips (or fails in CI with REQUIRE_DB_TESTS=1) when it is not running. */
export async function findLocalStack(label: string): Promise<LocalStack | null> {
  const stack = discover();
  let ok = false;
  if (stack) {
    try {
      ok = (await fetch(`${stack.url}/auth/v1/health`, { headers: { apikey: stack.anonKey } })).ok;
    } catch {
      ok = false;
    }
  }
  if (!ok && process.env.REQUIRE_DB_TESTS === '1') {
    throw new Error(`${label}: integration tests need the local Supabase stack (pnpm db:start).`);
  }
  if (!ok) console.warn(`[${label}] skipped: local Supabase stack not running`);
  return ok ? stack : null;
}

export async function runSql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  stack: LocalStack,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: stack.dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** A throwaway partner + tenant (with the given modules). Call `drop()` in afterAll. */
export async function createTestTenant(stack: LocalStack, modules: string[] = []) {
  const [partner] = await runSql<{ id: string }>(
    stack,
    `insert into partners (name) values ('Parceiro Teste') returning id`,
  );
  const [tenant] = await runSql<{ id: string }>(
    stack,
    `insert into tenants (partner_id, name, slug) values ($1, 'Tenant Teste', $2) returning id`,
    [partner!.id, `t-${randomUUID().slice(0, 12)}`],
  );
  for (const module of modules) {
    await runSql(stack, `insert into tenant_modules (tenant_id, module) values ($1, $2)`, [
      tenant!.id,
      module,
    ]);
  }
  return {
    tenantId: tenant!.id,
    partnerId: partner!.id,
    drop: async () => {
      await runSql(stack, `delete from tenants where id = $1`, [tenant!.id]);
      await runSql(stack, `delete from partners where id = $1`, [partner!.id]);
    },
  };
}
