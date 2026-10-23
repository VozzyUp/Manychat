import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

const llmOptional = z.string().min(1).optional();

export const workerEnvSchema = z
  .object({
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
    /** Without ANTHROPIC_API_KEY the worker runs, but no agent answers (conversations go to a human). */
    ANTHROPIC_API_KEY: llmOptional,
    LLM_MODEL_AGENT: llmOptional,
    LLM_MODEL_FAST: llmOptional,
    LLM_MODEL_VISION: llmOptional,
    LLM_PRICING: z.string().optional(),
    /** Without these, documents cannot be ingested (the panel shows why). */
    EMBEDDINGS_API_KEY: llmOptional,
    EMBEDDINGS_MODEL: llmOptional,
    EMBEDDINGS_BASE_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.ANTHROPIC_API_KEY) return;
    for (const key of ['LLM_MODEL_AGENT', 'LLM_MODEL_FAST', 'LLM_MODEL_VISION'] as const) {
      if (!env[key])
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when ANTHROPIC_API_KEY is set`,
        });
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source?: Record<string, string | undefined>): WorkerEnv =>
  parseEnv(workerEnvSchema, source);
