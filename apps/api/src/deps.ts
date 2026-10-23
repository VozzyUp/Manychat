import {
  createAuthVerifier,
  createServiceDb,
  createUserClient,
  type DbClient,
  type ServiceDb,
  type VerifiedUser,
} from '@nurion/db';
import type { Logger } from '@nurion/shared';
import type { ApiEnv } from './env';

/** Everything routes need from the outside world. Tests build the same thing against the local stack. */
export type AppDeps = {
  verifyToken: (token: string) => Promise<VerifiedUser | null>;
  /** Supabase client acting as the user (RLS applies). */
  userDb: (accessToken: string) => DbClient;
  /** Service role, only through withTenant() / system (ADR-0001). */
  serviceDb: ServiceDb;
  webUrl: string;
};

export function createDeps(env: ApiEnv, logger: Logger): AppDeps {
  return {
    verifyToken: createAuthVerifier({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }),
    userDb: (accessToken) =>
      createUserClient({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, accessToken }),
    serviceDb: createServiceDb({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      onTenantViolation: (error) => logger.error({ err: error }, 'tenant scope violation'),
    }),
    webUrl: env.WEB_URL,
  };
}
