// Bundles a Node app (api or worker) into dist/ with esbuild.
//
// Workspace packages (@nurion/*, TypeScript sources) are bundled into the output.
// npm dependencies stay external and are listed, with their versions, in dist/package.json,
// so the Docker image installs exactly them with `npm install --omit=dev` inside dist/.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const entry = process.argv[2] ?? 'src/index.ts';
const appDir = process.cwd();
const appPkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));

/** name -> version of every npm dependency reachable through workspace packages. */
const external = new Map();
const seen = new Set();

function walk(pkgDir) {
  const real = realpathSync(pkgDir);
  if (seen.has(real)) return;
  seen.add(real);
  const pkg = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (String(version).startsWith('workspace:')) {
      walk(join(real, 'node_modules', name));
      continue;
    }
    const previous = external.get(name);
    if (previous && previous !== version) {
      throw new Error(`Conflicting versions for ${name}: ${previous} vs ${version}`);
    }
    external.set(name, version);
  }
}
walk(appDir);

await build({
  entryPoints: [entry],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [...external.keys()].flatMap((d) => [d, `${d}/*`]),
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

writeFileSync(
  join(appDir, 'dist', 'package.json'),
  `${JSON.stringify(
    {
      name: `${appPkg.name}-dist`,
      private: true,
      type: 'module',
      main: 'index.js',
      dependencies: Object.fromEntries([...external.entries()].sort()),
    },
    null,
    2,
  )}\n`,
);
console.log(`dist/package.json: ${external.size} runtime dependencies`);
