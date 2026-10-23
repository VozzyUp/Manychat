import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { QUEUES, queueOutboundMessage, type ChannelContext } from '@nurion/core';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger, createSecretBox } from '@nurion/shared';
import { inbound } from '@nurion/whatsapp/fixtures';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorkers } from '../src/workers';

const stack = await findLocalStack('worker');
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
const redisUp = await redis.connect().then(
  () => true,
  () => false,
);
if (!redisUp && process.env.REQUIRE_DB_TESTS === '1') throw new Error('worker tests need Redis');
const describeAll = stack && redisUp ? describe : describe.skip;

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

describeAll('queues end to end (BullMQ + Redis + Supabase)', () => {
  const s = stack as LocalStack;
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const secrets = createSecretBox({ key: randomBytes(32).toString('base64') });
  const sends: unknown[] = [];
  let failNextSend = false;
  const graphFetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    if (init.method === 'POST') {
      sends.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
      if (failNextSend) {
        return new Response(JSON.stringify({ error: { code: 131026, message: 'undeliverable' } }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${digits(12)}` }] }), {
        status: 200,
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let ctx: ChannelContext;
  let phoneNumberId: string;
  let running: ReturnType<typeof startWorkers>;
  const queues = {
    inbound: new Queue(QUEUES.inboundMessages, { connection: redis, prefix }),
    outbound: new Queue(QUEUES.outboundMessages, { connection: redis, prefix }),
    dead: new Queue(QUEUES.deadLetter, { connection: redis, prefix }),
  };
  const events = {
    inbound: new QueueEvents(QUEUES.inboundMessages, { connection: redis.duplicate(), prefix }),
    outbound: new QueueEvents(QUEUES.outboundMessages, { connection: redis.duplicate(), prefix }),
  };

  beforeAll(async () => {
    tenant = await createTestTenant(s);
    phoneNumberId = digits(15);
    await runSql(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc)
       values ($1, $2, '102290129340398', '+55 11 4002-8922', $3)`,
      [tenant.tenantId, phoneNumberId, secrets.encrypt('tok')],
    );
    ctx = {
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      secrets,
      graph: { version: 'v23.0', fetch: graphFetch },
      logger: createLogger('worker-test', { level: 'silent' }),
    };
    running = startWorkers({
      connection: redis.duplicate(),
      prefix,
      ctx,
      logger: ctx.logger,
      concurrency: 2,
    });
    await Promise.all([events.inbound.waitUntilReady(), events.outbound.waitUntilReady()]);
  });

  afterAll(async () => {
    await running?.close();
    await Promise.all([...Object.values(queues), ...Object.values(events)].map((q) => q.close()));
    for (const q of Object.values(queues))
      await q.obliterate({ force: true }).catch(() => undefined);
    redis.disconnect();
    await tenant?.drop();
  });

  it('a webhook job becomes a stored message', async () => {
    const wamid = `wamid.${digits(20)}`;
    const body = inbound({ type: 'text', text: { body: 'iniciar' } }, wamid);
    (
      body.entry[0]!.changes[0]!.value as { metadata: { phone_number_id: string } }
    ).metadata.phone_number_id = phoneNumberId;
    const job = await queues.inbound.add('webhook', {
      body: JSON.stringify(body),
      receivedAt: new Date().toISOString(),
    });
    await job.waitUntilFinished(events.inbound, 15_000);
    const rows = await runSql(s, `select id from messages where wamid = $1`, [wamid]);
    expect(rows).toHaveLength(1);
  });

  it('a permanent send error stops retrying and lands in the dead-letter queue', async () => {
    const [conv] = await runSql<{ id: string }>(
      s,
      `select id from conversations where tenant_id = $1 limit 1`,
      [tenant.tenantId],
    );
    failNextSend = true;
    const messageId = await queueOutboundMessage(
      ctx.db.withTenant(tenant.tenantId),
      async (job) => {
        await queues.outbound.add('send', job, {
          jobId: job.messageId,
          attempts: 5,
          backoff: { type: 'fixed', delay: 50 },
        });
      },
      { conversationId: conv!.id, author: 'ai', content: { kind: 'text', text: 'Olá' } },
    );
    const job = (await queues.outbound.getJob(messageId))!;
    await expect(job.waitUntilFinished(events.outbound, 15_000)).rejects.toThrow(/recipient/);
    expect(sends).toHaveLength(1);

    await expect
      .poll(async () => (await queues.dead.getJobs(['waiting'])).length, { timeout: 5_000 })
      .toBe(1);
    const [dead] = await queues.dead.getJobs(['waiting']);
    expect(dead!.data).toMatchObject({ queue: QUEUES.outboundMessages, jobId: messageId });
    const [row] = await runSql<{ status: string }>(s, `select status from messages where id = $1`, [
      messageId,
    ]);
    expect(row!.status).toBe('failed');
    failNextSend = false;
  });
});
