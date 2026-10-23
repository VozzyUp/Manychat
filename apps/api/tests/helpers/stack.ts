import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { describe } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

type Stack = { url: string; anonKey: string; serviceKey: string; dbUrl: string };

/** Local Supabase connection details: env first, then `supabase status`. */
function discover(): Stack | null {
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
      dbUrl: json.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    };
  } catch {
    return null;
  }
}

async function reachable(stack: Stack | null): Promise<boolean> {
  if (!stack) return false;
  try {
    const res = await fetch(`${stack.url}/auth/v1/health`, { headers: { apikey: stack.anonKey } });
    return res.ok;
  } catch {
    return false;
  }
}

const found = discover();
export const stackAvailable = await reachable(found);
if (!stackAvailable && process.env.REQUIRE_DB_TESTS === '1') {
  throw new Error('API integration tests need the local Supabase stack (pnpm db:start).');
}
if (!stackAvailable) console.warn('[api tests] skipped: local Supabase stack not running');

export const stack = found as Stack;
export const describeStack = stackAvailable ? describe : describe.skip;

export const PASSWORD = 'Test-Password-123!';

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: stack.dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

export async function createUser(name: string) {
  const email = `${name}-${randomUUID().slice(0, 8)}@test.local`;
  const res = await fetch(`${stack.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: stack.serviceKey,
      authorization: `Bearer ${stack.serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: name },
    }),
  });
  if (!res.ok) throw new Error(`createUser ${res.status}: ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  return { id: user.id, email };
}

export async function signIn(email: string): Promise<string> {
  const res = await fetch(`${stack.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`signIn ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Deletes test users (cascades to profiles, memberships and factors). */
export async function deleteUsers(ids: string[]) {
  if (ids.length) await sql(`delete from auth.users where id = any($1::uuid[])`, [ids]);
}
