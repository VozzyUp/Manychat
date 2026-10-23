// Prints (or writes into .env) the connection variables of the local Supabase stack.
//
//   node scripts/supabase-env.mjs            # KEY=VALUE lines (CI: >> $GITHUB_ENV)
//   node scripts/supabase-env.mjs --write    # create/update .env from .env.example
import { execFileSync } from 'node:child_process';
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

const source = existsSync('.env') ? '.env' : '.env.example';
let text = readFileSync(source, 'utf8');
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${text.trimEnd()}\n${line}\n`;
}
writeFileSync('.env', text);
console.log(`.env updated from ${source} with the local Supabase keys.`);
