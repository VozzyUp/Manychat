import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

export const apiEnvSchema = z.object({
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
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source?: Record<string, string | undefined>): ApiEnv =>
  parseEnv(apiEnvSchema, source);
