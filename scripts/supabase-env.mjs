// Prints (or writes into .env) the connection variables of the local Supabase stack.
//
//   node scripts/supabase-env.mjs            # KEY=VALUE lines (CI: >> $GITHUB_ENV)
//   node scripts/supabase-env.mjs --write    # create/update .env from .env.example;
//                                            # also fills empty local-only secrets
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const status = JSON.parse(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);

const values = {
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  DATABASE_URL: status.DB_URL,
};
for (const [key, value] of Object.entries(values)) {
  if (!value) throw new Error(`supabase status did not return ${key}; is the stack running?`);
}

if (!process.argv.includes('--write')) {
  for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
  process.exit(0);
}

// Local-only secrets, generated once (never reuse them in production).
const generated = {
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  WHATSAPP_VERIFY_TOKEN: `local-${randomBytes(8).toString('hex')}`,
  WHATSAPP_APP_SECRET: `local-${randomBytes(16).toString('hex')}`,
};

const source = existsSync('.env') ? '.env' : '.env.example';
let text = readFileSync(source, 'utf8');
const set = (key, value, onlyIfEmpty) => {
  const line = new RegExp(`^${key}=(.*)$`, 'm');
  const match = line.exec(text);
  if (match && onlyIfEmpty && match[1].trim()) return;
  text = match ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};
for (const [key, value] of Object.entries(values)) set(key, value, false);
for (const [key, value] of Object.entries(generated)) set(key, value, true);
writeFileSync('.env', text);
console.log(`.env updated from ${source} with the local Supabase keys and local secrets.`);
