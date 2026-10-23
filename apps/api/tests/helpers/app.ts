import { createLogger } from '@nurion/shared';
import { buildApp } from '../../src/app';
import { createDeps } from '../../src/deps';
import { loadApiEnv } from '../../src/env';
import { stack } from './stack';

export async function buildTestApp() {
  const env = loadApiEnv({
    SUPABASE_URL: stack.url,
    SUPABASE_ANON_KEY: stack.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: stack.serviceKey,
    WEB_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
  });
  const logger = createLogger('api-test', { level: 'silent' });
  return buildApp({ logger, deps: createDeps(env, logger) });
}

export const as = (token: string, tenantId?: string) => ({
  authorization: `Bearer ${token}`,
  ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
});

/** multipart/form-data body with one file field. */
export function multipartFile(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = `----nurion${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** Smallest valid 1x1 PNG. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
