import { createErrorReporter, DEFAULT_JOB_OPTIONS, QUEUES } from '@nurion/core';
import { createLogger } from '@nurion/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { buildApp } from './app';
import { createDeps } from './deps';
import { loadApiEnv } from './env';

const env = loadApiEnv();
const logger = createLogger('api', { level: env.LOG_LEVEL });
const reporter = createErrorReporter(env.SENTRY_DSN, 'api');
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
const inboundQueue = new Queue(QUEUES.inboundMessages, {
  connection: redis,
  prefix: env.QUEUE_PREFIX,
  defaultJobOptions: DEFAULT_JOB_OPTIONS[QUEUES.inboundMessages],
});

const app = await buildApp({
  logger,
  reportError: reporter.capture,
  deps: createDeps(env, logger, {
    enqueueInbound: async (job, jobId) => {
      await inboundQueue.add('webhook', job, { jobId });
    },
  }),
  checks: [
    {
      name: 'redis',
      check: async () => {
        if (redis.status === 'wait') await redis.connect();
        await redis.ping();
      },
    },
    {
      name: 'supabase',
      check: async () => {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: env.SUPABASE_ANON_KEY },
        });
        if (!res.ok) throw new Error(`auth health ${res.status}`);
      },
    },
  ],
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await inboundQueue.close();
  await reporter.flush();
  redis.disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.API_PORT, host: env.API_HOST });
