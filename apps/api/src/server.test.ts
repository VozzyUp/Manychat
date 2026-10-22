import { AppError, createLogger } from '@nurion/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildServer } from './server';

const logger = createLogger('api-test', { level: 'silent' });

describe('api server', () => {
  it('GET /health answers ok and echoes a request id', async () => {
    const app = await buildServer({ logger });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /ready is 503 when a dependency fails, 200 when all pass', async () => {
    const failing = await buildServer({
      logger,
      checks: [
        { name: 'redis', check: async () => undefined },
        { name: 'db', check: () => Promise.reject(new Error('down')) },
      ],
    });
    const bad = await failing.inject({ method: 'GET', url: '/ready' });
    expect(bad.statusCode).toBe(503);
    expect(bad.json().checks).toContainEqual({ name: 'db', ok: false, error: 'down' });

    const healthy = await buildServer({
      logger,
      checks: [{ name: 'redis', check: async () => {} }],
    });
    expect((await healthy.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
  });

  it('GET /ready times out slow checks', async () => {
    const app = await buildServer({
      logger,
      readinessTimeoutMs: 20,
      checks: [{ name: 'slow', check: () => new Promise((r) => setTimeout(r, 200)) }],
    });
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
  });

  it('maps AppError and ZodError to the documented error shape', async () => {
    const app = await buildServer({ logger });
    app.get('/boom/app', async () => {
      throw new AppError('forbidden', 'nope');
    });
    app.get('/boom/zod', async () => z.object({ a: z.string() }).parse({}));
    app.get('/boom/unknown', async () => {
      throw new Error('secret detail');
    });

    const forbidden = await app.inject({ method: 'GET', url: '/boom/app' });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ error: { code: 'forbidden', message: 'nope' } });

    const invalid = await app.inject({ method: 'GET', url: '/boom/zod' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('validation_error');

    const crash = await app.inject({ method: 'GET', url: '/boom/unknown' });
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain('secret detail');
  });
});
