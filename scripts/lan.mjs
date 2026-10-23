// Points the local environment at this machine's address on the local network, so the panel can be
// opened from another device (phone, other PC).
//
//   node scripts/lan.mjs            # detect the LAN address and update .env
//   node scripts/lan.mjs --ip 192.168.0.20
//   node scripts/lan.mjs --off      # back to localhost
//
// The panel talks to Supabase from the server, but file links (signed URLs) are opened by the
// browser, so SUPABASE_URL must be reachable from the other device too.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const args = process.argv.slice(2);
const off = args.includes('--off');
const ipArg = args.includes('--ip') ? args[args.indexOf('--ip') + 1] : undefined;

const isPrivate = (ip) =>
  /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

function detect() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|tailscale|utun|vmnet)/i.test(name)) continue;
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal && isPrivate(info.address))
        found.push(info.address);
    }
  }
  return found;
}

if (!existsSync('.env')) {
  console.error('No .env yet. Run: pnpm db:start && pnpm env:local');
  process.exit(1);
}

let host = 'localhost';
let supabaseHost = '127.0.0.1';
if (!off) {
  const candidates = ipArg ? [ipArg] : detect();
  if (!candidates.length) {
    console.error(
      'Could not find a LAN address. Pass it yourself: node scripts/lan.mjs --ip 192.168.0.20',
    );
    process.exit(1);
  }
  if (candidates.length > 1)
    console.log(
      `Several addresses found (${candidates.join(', ')}); using ${candidates[0]}. Use --ip to choose.`,
    );
  host = supabaseHost = candidates[0];
}

let text = readFileSync('.env', 'utf8');
const set = (key, value) => {
  const line = new RegExp(`^${key}=.*$`, 'm');
  text = line.test(text)
    ? text.replace(line, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
};
set('WEB_URL', `http://${host}:3000`);
set('API_URL', `http://${host}:4000`);
set('SUPABASE_URL', `http://${supabaseHost}:54321`);
writeFileSync('.env', text);

if (off) {
  console.log('.env back to localhost.');
} else {
  console.log(`.env now uses ${host}. Start with: pnpm dev`);
  console.log(`\n  Panel (open this on the other device):  http://${host}:3000`);
  console.log(`  E-mails (convites, senha):               http://${host}:54324`);
  console.log(
    "\nIf it does not open, allow ports 3000, 4000, 54321 and 54324 in this machine's firewall.",
  );
}
