import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHealthServer } from './health';

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start(check: () => Promise<boolean>) {
  const server = createHealthServer(check);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('worker health server', () => {
  it('returns 200 when the check passes', async () => {
    const base = await start(async () => true);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('returns 503 when the check fails or throws', async () => {
    const base = await start(() => Promise.reject(new Error('redis down')));
    expect((await fetch(`${base}/health`)).status).toBe(503);
  });

  it('returns 404 for other paths', async () => {
    const base = await start(async () => true);
    expect((await fetch(`${base}/other`)).status).toBe(404);
  });
});
