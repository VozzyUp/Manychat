import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The servers started below inherit the monorepo's .env (CI passes the same variables instead).
const rootEnv = new URL('../../.env', import.meta.url).pathname;
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
// The API talks to a fake Graph API in e2e, never to Meta.
process.env.WHATSAPP_GRAPH_BASE_URL = 'http://localhost:4900';
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
// The model and embeddings also point at the fake server (see e2e/fake-graph.mjs).
process.env.ANTHROPIC_API_KEY = 'e2e-key';
process.env.ANTHROPIC_BASE_URL = 'http://localhost:4900';
process.env.LLM_MODEL_AGENT = 'e2e-agent';
process.env.LLM_MODEL_FAST = 'e2e-fast';
process.env.LLM_MODEL_VISION = 'e2e-vision';
process.env.LLM_PRICING =
  '{"e2e-agent":{"input":2,"output":10},"e2e-embed":{"input":0.02,"output":0}}';
process.env.EMBEDDINGS_API_KEY = 'e2e-key';
process.env.EMBEDDINGS_MODEL = 'e2e-embed';
process.env.EMBEDDINGS_BASE_URL = 'http://localhost:4900/v1';
process.env.WHATSAPP_APP_SECRET ||= 'e2e-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN ||= 'e2e-verify-token';

/**
 * End-to-end tests of the panel against the local stack (Supabase + api + web).
 * Start them with: pnpm db:start, then `pnpm --filter @nurion/web e2e` (servers start automatically).
 * Locally, PW_CHROMIUM_PATH points at a preinstalled Chromium; CI installs its own.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
      grep: /@mobile/,
    },
  ],
  webServer: [
    {
      command: 'node e2e/fake-graph.mjs',
      url: 'http://localhost:4900/health',
      reuseExistingServer: true,
    },
    {
      command: 'pnpm --filter @nurion/api exec tsx --env-file-if-exists=../../.env src/index.ts',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      cwd: '../..',
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3000',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
