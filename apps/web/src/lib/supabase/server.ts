import 'server-only';
import type { Database } from '@nurion/db/types';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverEnv } from '../env';

/**
 * Supabase client acting as the signed-in user (cookies), for Server Components and Server Actions.
 * Every read goes through RLS (ADR-0002).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = serverEnv();
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
