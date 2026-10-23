import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

export const DEMO_PASSWORD = 'NurionDemo!2026';
export const DEMO = {
  owner: 'gestor@demo.local',
  quality: 'qualidade@demo.local',
  viewer: 'leitor@demo.local',
};
export const TENANT_LOG = {
  id: '00000000-0000-4000-8000-0000000000a1',
  slug: 'transportadora-demo',
  name: 'Transportadora Demo',
};
export const TENANT_LAB = {
  id: '00000000-0000-4000-8000-0000000000b1',
  slug: 'laboratorio-demo',
  name: 'Laboratório Demo',
};

type Stack = { url: string; serviceKey: string; dbUrl: string; mailpit: string };

let stack: Stack | undefined;
export function localStack(): Stack {
  if (stack) return stack;
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
    cwd: new URL('../../../', import.meta.url).pathname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const j = JSON.parse(out) as Record<string, string>;
  stack = {
    url: j.API_URL!,
    serviceKey: j.SERVICE_ROLE_KEY!,
    dbUrl: j.DB_URL!,
    mailpit: j.MAILPIT_URL ?? j.INBUCKET_URL!,
  };
  return stack;
}

export async function sql<T extends pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: localStack().dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** A throwaway user with a password, member of `tenantId` with `role`. */
export async function createMember(tenantId: string, role: string, password = 'Senha-Teste-123') {
  const { url, serviceKey } = localStack();
  const email = `e2e-${randomUUID().slice(0, 8)}@test.local`;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Pessoa E2E' },
    }),
  });
  const user = (await res.json()) as { id: string };
  await sql(`insert into tenant_members (tenant_id, user_id, role) values ($1, $2, $3)`, [
    tenantId,
    user.id,
    role,
  ]);
  return { id: user.id, email, password };
}

export const deleteUser = (id: string) => sql(`delete from auth.users where id = $1`, [id]);

/** Signs in through the form and waits until the session cookie is set (we left /login). */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await submitLogin(page, email, password);
  await page.waitForURL((url) => url.pathname !== '/login');
}

/** Fills and submits the login form without waiting for success (for negative cases). */
export async function submitLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Messages of the page's forms (Next's route announcer is also role=alert, outside <main>). */
export const formAlert = (page: Page) => page.getByRole('main').getByRole('alert');
export const formStatus = (page: Page) => page.getByRole('main').getByRole('status');

/** Latest e-mail sent to `to` (local Mailpit). */
export async function lastEmailTo(to: string): Promise<{ subject: string; html: string }> {
  const base = localStack().mailpit;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = (await (
      await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    ).json()) as {
      messages?: { ID: string; Subject: string }[];
    };
    const first = list.messages?.[0];
    if (first) {
      const message = (await (await fetch(`${base}/api/v1/message/${first.ID}`)).json()) as {
        HTML: string;
      };
      return { subject: first.Subject, html: message.HTML };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no e-mail for ${to}`);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), like any authenticator app. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretBase32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Fails on serious or critical accessibility violations (WCAG 2 A/AA rules). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} → ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join(' | ')}`,
    ),
  ).toEqual([]);
}

/** Collects console errors so a test can assert there were none. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}
