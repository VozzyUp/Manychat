// Checks package.json dependencies against the architecture rules (ESCOPO §3, CLAUDE.md rule 10).
// ESLint catches imports; this catches declared dependencies, so a forbidden edge cannot be added
// to a package.json and used later.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps', 'packages', 'packages/modules'];
const packages = [];
for (const root of roots) {
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    const file = join(root, dir.name, 'package.json');
    if (dir.isDirectory() && existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      const internal = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
        d.startsWith('@nurion/'),
      );
      packages.push({ name: pkg.name, internal });
    }
  }
}

/** Allowed internal dependencies per package (prefix match for modules). */
const allowed = {
  '@nurion/shared': [],
  '@nurion/db': ['@nurion/shared'],
  '@nurion/whatsapp': ['@nurion/shared'],
  '@nurion/core': ['@nurion/shared', '@nurion/db', '@nurion/whatsapp'],
  '@nurion/web': ['@nurion/shared', '@nurion/db'],
  '@nurion/api': [
    '@nurion/shared',
    '@nurion/db',
    '@nurion/whatsapp',
    '@nurion/core',
    '@nurion/module-',
  ],
  '@nurion/worker': [
    '@nurion/shared',
    '@nurion/db',
    '@nurion/whatsapp',
    '@nurion/core',
    '@nurion/module-',
  ],
};
const moduleAllowed = ['@nurion/shared', '@nurion/core'];

const errors = [];
for (const { name, internal } of packages) {
  const rules = name.startsWith('@nurion/module-') ? moduleAllowed : allowed[name];
  if (!rules) {
    errors.push(`${name}: no boundary rule defined (add it to scripts/check-boundaries.mjs)`);
    continue;
  }
  for (const dep of internal) {
    const ok = rules.some((rule) => (rule.endsWith('-') ? dep.startsWith(rule) : dep === rule));
    if (!ok) errors.push(`${name} must not depend on ${dep}`);
  }
}

if (errors.length) {
  console.error(`Boundary violations:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`Boundaries ok (${packages.length} packages).`);
