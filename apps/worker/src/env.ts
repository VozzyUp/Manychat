import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

export const workerEnvSchema = z.object({
  ...envFragments.log,
  ...envFragments.redis,
  ...envFragments.supabase,
  ...envFragments.supabaseService,
  ...envFragments.crypto,
  WHATSAPP_GRAPH_VERSION: envFragments.whatsapp.WHATSAPP_GRAPH_VERSION,
  /** Only for local tools that fake the Graph API. */
  WHATSAPP_GRAPH_BASE_URL: z.url().optional(),
  QUEUE_PREFIX: z.string().default('nurion'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4100),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source?: Record<string, string | undefined>): WorkerEnv =>
  parseEnv(workerEnvSchema, source);
