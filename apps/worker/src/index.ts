import { createLogger } from '@nurion/shared';
import type { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env';
import { createHealthServer } from './health';
import { buildRegistry } from './modules';

const env = loadWorkerEnv();
const logger = createLogger('worker', { level: env.LOG_LEVEL });
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const registry = buildRegistry();
// Queue processors are attached here as the build steps land (inbound-messages in step 1.4, ...).
const workers: Worker[] = [];

const health = createHealthServer(async () => (await connection.ping()) === 'PONG');
health.listen(env.WORKER_HEALTH_PORT, () => {
  logger.info(
    { port: env.WORKER_HEALTH_PORT, modules: registry.list().map((m) => m.key) },
    'worker started',
  );
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await Promise.all(workers.map((w) => w.close()));
  health.close();
  connection.disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
