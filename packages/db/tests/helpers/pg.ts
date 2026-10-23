import pg from 'pg';
import { describe } from 'vitest';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function canConnect(): Promise<boolean> {
  const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export const dbAvailable = await canConnect();

if (!dbAvailable && process.env.REQUIRE_DB_TESTS === '1') {
  throw new Error(`Database tests are required but ${DATABASE_URL} is unreachable.`);
}
if (!dbAvailable) {
  console.warn(`[db tests] skipped: no database at ${DATABASE_URL} (run: pnpm db:start)`);
}

/** `describe` that skips when no local database is up (and fails in CI, see REQUIRE_DB_TESTS). */
export const describeDb = dbAvailable ? describe : describe.skip;

export type Db = pg.PoolClient;

let pool: pg.Pool | undefined;
const getPool = () => (pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 }));

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Runs `fn` inside a transaction that is always rolled back: tests never leave data behind. */
export async function inRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

/** Act as a signed-in user (what PostgREST does with the user's JWT). */
export async function asUser(db: Db, userId: string): Promise<void> {
  await db.query('set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
}

/** Back to the connection owner (postgres), e.g. to inspect what really happened. */
export async function asOwner(db: Db): Promise<void> {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}

/**
 * Runs a statement that must be refused. Accepts both refusals Postgres gives:
 * an RLS/privilege error (SQLSTATE 42501) or a statement that silently touches 0 rows.
 * Uses a savepoint so the surrounding transaction stays usable.
 */
export async function expectRefused(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<'error' | 'no_rows'> {
  await db.query('savepoint refused');
  try {
    const result = await db.query(sql, params);
    await db.query('release savepoint refused');
    if ((result.rowCount ?? 0) > 0) {
      throw new Error(`Expected refusal, but ${result.rowCount} row(s) were affected: ${sql}`);
    }
    return 'no_rows';
  } catch (error) {
    const code = (error as { code?: string }).code;
    await db.query('rollback to savepoint refused');
    if (code === '42501' || code === '23514') return 'error';
    throw error;
  }
}

/** Runs a statement that must fail with the given SQLSTATE. */
export async function expectSqlError(
  db: Db,
  code: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await db.query('savepoint expected_error');
  try {
    await db.query(sql, params);
  } catch (error) {
    await db.query('rollback to savepoint expected_error');
    const got = (error as { code?: string }).code;
    if (got !== code) {
      throw new Error(`Expected SQLSTATE ${code}, got ${got}: ${String(error)}`, { cause: error });
    }
    return;
  }
  await db.query('release savepoint expected_error');
  throw new Error(`Expected SQLSTATE ${code}, but the statement succeeded: ${sql}`);
}
