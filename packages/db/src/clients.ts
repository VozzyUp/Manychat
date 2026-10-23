import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTenantFetch, type TenantScopeError } from './tenant-fetch';
import type { Database } from './types';

export type DbClient = SupabaseClient<Database>;

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/**
 * Client that acts as the signed-in user: every query goes through RLS (ADR-0001, ADR-0002).
 * Used by apps/api with the JWT the panel sends.
 */
export function createUserClient(options: {
  url: string;
  anonKey: string;
  accessToken: string;
}): DbClient {
  return createClient<Database>(options.url, options.anonKey, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${options.accessToken}` } },
  });
}

export type ServiceDbOptions = {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  /** Called when code tries to leave its tenant (log it loudly: it is a bug). */
  onTenantViolation?: (error: TenantScopeError) => void;
};

/** A service-role client pinned to one tenant. Same API as a normal Supabase client. */
export type TenantDb = DbClient & { readonly tenantId: string };

/**
 * Service-role access for the worker and webhooks. The raw client never leaves this package:
 * callers get `withTenant(tenantId)` (pinned to one tenant) and `system` (named cross-tenant lookups).
 */
export function createServiceDb(options: ServiceDbOptions) {
  const baseFetch = options.fetch ?? fetch;
  const raw = createClient<Database>(options.url, options.serviceRoleKey, {
    auth: noSession,
    global: { fetch: baseFetch },
  });

  const withTenant = (tenantId: string): TenantDb => {
    const scoped = createClient<Database>(options.url, options.serviceRoleKey, {
      auth: noSession,
      global: { fetch: createTenantFetch(tenantId, baseFetch, options.onTenantViolation) },
    });
    return Object.assign(scoped, { tenantId });
  };

  return {
    withTenant,
    /** Cross-tenant lookups that cannot have a tenant yet. Each one is named and reviewed. */
    system: createSystemQueries(raw),
  };
}

export type ServiceDb = ReturnType<typeof createServiceDb>;

function createSystemQueries(raw: DbClient) {
  return {
    /** Tenant ids that are active (scheduled jobs iterate over these). */
    async listActiveTenantIds(): Promise<string[]> {
      const { data, error } = await raw.from('tenants').select('id').eq('status', 'active');
      if (error) throw error;
      return data.map((t) => t.id);
    },
    /** Name, branding and settings of one tenant (worker builds agent context with it). */
    async getTenant(tenantId: string) {
      const { data, error } = await raw
        .from('tenants')
        .select('id, partner_id, name, slug, branding, settings, status')
        .eq('id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}
