import { createErrorReporter } from '@nurion/core';
import { createServiceDb } from '@nurion/db';
import { createLogger, createSecretBox } from '@nurion/shared';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env';
import { createHealthServer } from './health';
import { buildRegistry } from './modules';
import { startWorkers } from './workers';

const env = loadWorkerEnv();
const logger = createLogger('worker', { level: env.LOG_LEVEL });
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const registry = buildRegistry();
const reporter = createErrorReporter(env.SENTRY_DSN, 'worker');

const { close } = await startWorkers({
  connection,
  prefix: env.QUEUE_PREFIX,
  concurrency: env.WORKER_CONCURRENCY,
  logger,
  reportError: reporter.capture,
  ctx: {
    db: createServiceDb({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      onTenantViolation: (error) => logger.error({ err: error }, 'tenant scope violation'),
    }),
    secrets: createSecretBox({ key: env.ENCRYPTION_KEY, previousKey: env.ENCRYPTION_KEY_PREVIOUS }),
    graph: { version: env.WHATSAPP_GRAPH_VERSION, baseUrl: env.WHATSAPP_GRAPH_BASE_URL },
    logger,
    registry,
    // Staff intent classifier and agents plug in with the agent engine (build step 1.6).
  },
});

const health = createHealthServer(async () => (await connection.ping()) === 'PONG');
health.listen(env.WORKER_HEALTH_PORT, () => {
  logger.info(
    { port: env.WORKER_HEALTH_PORT, modules: registry.list().map((m) => m.key) },
    'worker started',
  );
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await close();
  await reporter.flush();
  health.close();
  connection.disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
