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
  // Logo uploads go through a Server Action (limit 1 MB in the API).
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default config;
