import { createLogger } from '@nurion/shared';
import { Redis } from 'ioredis';
import { loadApiEnv } from './env';
import { buildServer } from './server';

const env = loadApiEnv();
const logger = createLogger('api', { level: env.LOG_LEVEL });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

const app = await buildServer({
  logger,
  checks: [
    {
      name: 'redis',
      check: async () => {
        if (redis.status === 'wait') await redis.connect();
        await redis.ping();
      },
    },
  ],
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  redis.disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.API_PORT, host: env.API_HOST });
