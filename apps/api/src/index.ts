import { createLogger } from '@nurion/shared';
import { Redis } from 'ioredis';
import { buildApp } from './app';
import { createDeps } from './deps';
import { loadApiEnv } from './env';

const env = loadApiEnv();
const logger = createLogger('api', { level: env.LOG_LEVEL });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

const app = await buildApp({
  logger,
  deps: createDeps(env, logger),
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
  redis.disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.API_PORT, host: env.API_HOST });
