import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

const optionalText = z.string().min(1).optional();

export const apiEnvSchema = z
  .object({
    ...envFragments.log,
    ...envFragments.redis,
    ...envFragments.supabase,
    ...envFragments.supabaseService,
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_HOST: z.string().default('0.0.0.0'),
    WEB_URL: z.url().default('http://localhost:3000'),
    QUEUE_PREFIX: z.string().default('nurion'),
    // WhatsApp and the token vault are optional so the panel runs without them; their routes answer 503.
    ENCRYPTION_KEY: envFragments.crypto.ENCRYPTION_KEY.optional(),
    ENCRYPTION_KEY_PREVIOUS: envFragments.crypto.ENCRYPTION_KEY_PREVIOUS,
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
    WHATSAPP_GRAPH_VERSION: envFragments.whatsapp.WHATSAPP_GRAPH_VERSION,
    WHATSAPP_GRAPH_BASE_URL: z.url().optional(),
    // "Testar a base" needs the model and embeddings; without them its route answers 503.
    ANTHROPIC_API_KEY: optionalText,
    LLM_MODEL_AGENT: optionalText,
    LLM_MODEL_FAST: optionalText,
    LLM_MODEL_VISION: optionalText,
    LLM_PRICING: z.string().optional(),
    EMBEDDINGS_API_KEY: optionalText,
    EMBEDDINGS_MODEL: optionalText,
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

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source?: Record<string, string | undefined>): ApiEnv =>
  parseEnv(apiEnvSchema, source);
