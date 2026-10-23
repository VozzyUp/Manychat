import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  defineModule,
  ModuleRegistry,
  parsePricing,
  QUEUES,
  type AgentDefinition,
  type LlmClient,
} from '@nurion/core';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger, createSecretBox } from '@nurion/shared';
import { inbound } from '@nurion/whatsapp/fixtures';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorkers } from '../src/workers';

const stack = await findLocalStack('worker agent wiring');
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
const redisUp = await redis.connect().then(
  () => true,
  () => false,
);
const describeAll = stack && redisUp ? describe : describe.skip;
const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

const agent: AgentDefinition = {
  key: 'log.driver',
  module: 'log',
  systemPrompt: () => 'Atenda o motorista.',
  tools: [],
  knowledgeScopes: [],
  requireCitation: true,
  maxTurns: 3,
};

describeAll('agent engine wired into the worker (BullMQ + Supabase, model mocked)', () => {
  const s = stack as LocalStack;
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const secrets = createSecretBox({ key: randomBytes(32).toString('base64') });
  const sends: { to: string; text?: { body: string } }[] = [];
  const modelCalls: { model: string }[] = [];
  const llm: LlmClient = {
    async create(params) {
      modelCalls.push({ model: params.model });
      return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: params.model,
        stop_reason: 'tool_use',
        stop_sequence: null,
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'reply',
            input: { kind: 'clarification', text: 'Qual o número da entrega?' },
          },
        ],
        usage: {
          input_tokens: 500,
          output_tokens: 40,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      } as never;
    },
  };
  const graphFetch = (async (_input: string | URL | Request, init: RequestInit = {}) => {
    if (init.method === 'POST') {
      sends.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${digits(12)}` }] }), {
        status: 200,
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let phoneNumberId: string;
  let running: Awaited<ReturnType<typeof startWorkers>>;
  const inboundQueue = new Queue(QUEUES.inboundMessages, { connection: redis, prefix });
  const events = new QueueEvents(QUEUES.inboundMessages, { connection: redis.duplicate(), prefix });

  beforeAll(async () => {
    tenant = await createTestTenant(s, ['log']);
    phoneNumberId = digits(15);
    await runSql(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc) values ($1, $2, '102290129340398', '+55 11 4002-8922', $3)`,
      [tenant.tenantId, phoneNumberId, secrets.encrypt('tok')],
    );
    await runSql(
      s,
      `insert into contacts (tenant_id, wa_id, name, kind) values ($1, '5511987654321', 'João', 'driver')`,
      [tenant.tenantId],
    );
    const logger = createLogger('worker-agent-test', { level: 'silent' });
    running = await startWorkers({
      connection: redis.duplicate(),
      prefix,
      logger,
      concurrency: 2,
      schedules: false,
      turnDebounceMs: 50,
      llm: {
        client: llm,
        models: { agent: 'test-model-agent', fast: 'test-model-fast', vision: 'test-model-vision' },
        pricing: parsePricing('{"test-model-agent":{"input":2,"output":10}}'),
      },
      ctx: {
        db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
        secrets,
        graph: { version: 'v23.0', fetch: graphFetch },
        logger,
        registry: new ModuleRegistry().register(
          defineModule({ key: 'log', label: 'Log', agentFor: () => 'log.driver', agents: [agent] }),
        ),
      },
    });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await running?.close();
    await inboundQueue.close();
    await events.close();
    await inboundQueue.obliterate({ force: true }).catch(() => undefined);
    redis.disconnect();
    await tenant?.drop();
  });

  it('a driver message becomes an answer from the agent, sent on WhatsApp and recorded in ai_runs', async () => {
    const body = inbound({ type: 'text', text: { body: 'iniciar' } }, `wamid.${digits(20)}`);
    (
      body.entry[0]!.changes[0]!.value as unknown as { metadata: { phone_number_id: string } }
    ).metadata.phone_number_id = phoneNumberId;
    const job = await inboundQueue.add('webhook', {
      body: JSON.stringify(body),
      receivedAt: new Date().toISOString(),
    });
    await job.waitUntilFinished(events, 15_000);

    await expect.poll(() => sends.length, { timeout: 10_000 }).toBe(1);
    expect(sends[0]).toMatchObject({ text: { body: 'Qual o número da entrega?' } });
    expect(modelCalls).toEqual([{ model: 'test-model-agent' }]);
    const runs = await runSql<{ outcome: string; cost_usd: string; agent_key: string }>(
      s,
      `select outcome, cost_usd::text, agent_key from ai_runs where tenant_id = $1`,
      [tenant.tenantId],
    );
    expect(runs).toEqual([{ outcome: 'answered', cost_usd: '0.001400', agent_key: 'log.driver' }]);
  });
});
