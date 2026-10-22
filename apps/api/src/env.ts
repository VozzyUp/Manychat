import { envFragments, parseEnv } from '@nurion/shared';
import { z } from 'zod';

export const apiEnvSchema = z.object({
  ...envFragments.log,
  ...envFragments.redis,
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source?: Record<string, string | undefined>): ApiEnv =>
  parseEnv(apiEnvSchema, source);
