import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  transpilePackages: ['@nurion/shared'],
  poweredByHeader: false,
};

export default config;
