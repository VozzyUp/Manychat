import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Local development reads the monorepo's .env (production injects env vars in the container).
const rootEnv = join(root, '.env');
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  transpilePackages: ['@nurion/shared', '@nurion/db'],
  poweredByHeader: false,
  // Testing from another device on the local network (`pnpm dev:lan`): private ranges only, dev server only.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  // Logos (1 MB) and documents (20 MB, enforced by the API) are uploaded through Server Actions.
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
};

export default config;
