import { z } from 'zod';

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Validates environment variables against a zod object schema.
 * Empty strings are treated as missing, so `FOO=` in a .env file does not satisfy a required var.
 */
export function parseEnv<S extends z.ZodObject>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Reusable env fragments. Apps compose the ones they need. */
export const envFragments = {
  log: {
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SENTRY_DSN: z.url().optional(),
  },
  redis: {
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  },
  supabase: {
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(1),
  },
  supabaseService: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  },
  llm: {
    ANTHROPIC_API_KEY: z.string().min(1),
    LLM_MODEL_AGENT: z.string().min(1),
    LLM_MODEL_FAST: z.string().min(1),
    LLM_MODEL_VISION: z.string().min(1),
    LLM_PRICING: z.string().optional(),
  },
} as const;
