import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

export const workerEnvSchema = z.object({
  ...envFragments.log,
  ...envFragments.redis,
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4100),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source?: Record<string, string | undefined>): WorkerEnv =>
  parseEnv(workerEnvSchema, source);
