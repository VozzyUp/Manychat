import 'server-only';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  API_URL: z.url().default('http://localhost:4000'),
  WEB_URL: z.url().default('http://localhost:3000'),
});

let cached: z.infer<typeof schema> | undefined;

/** Server-only configuration. The browser never sees these values. */
export function serverEnv() {
  cached ??= schema.parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    API_URL: process.env.API_URL || undefined,
    WEB_URL: process.env.WEB_URL || undefined,
  });
  return cached;
}
