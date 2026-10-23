import { resolveBranding, type ModuleKey, type ResolvedBranding } from '@nurion/shared';
import type { DbClient } from '../clients';
import type { AppRole } from '../types';

export type TenantMembership = {
  role: AppRole;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    timezone: string;
    branding: ResolvedBranding;
    modules: ModuleKey[];
  };
};

export type PartnerMembership = { role: 'admin' | 'viewer'; partner: { id: string; name: string } };

const MODULE_ORDER: ModuleKey[] = ['log', 'labs', 'consult', 'adm'];

/**
 * Tenants the user belongs to, with resolved branding and enabled modules.
 * Runs with the user's own client, so RLS decides what comes back.
 */
export async function loadTenantMemberships(
  client: DbClient,
  userId: string,
): Promise<TenantMembership[]> {
  const { data, error } = await client
    .from('tenant_members')
    .select(
      'role, tenant:tenants!inner(id, name, slug, status, branding, settings, partner:partners(name, branding), modules:tenant_modules(module, enabled))',
    )
    .eq('user_id', userId);
  if (error) throw error;

  return data
    .map(({ role, tenant }) => ({
      role,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        timezone: readTimezone(tenant.settings),
        branding: resolveBranding({
          tenant: tenant.branding,
          partner: tenant.partner?.branding,
          partnerName: tenant.partner?.name,
        }),
        modules: MODULE_ORDER.filter((m) =>
          tenant.modules.some((row) => row.module === m && row.enabled),
        ),
      },
    }))
    .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name, 'pt-BR'));
}

export async function loadPartnerMemberships(
  client: DbClient,
  userId: string,
): Promise<PartnerMembership[]> {
  const { data, error } = await client
    .from('partner_members')
    .select('role, partner:partners!inner(id, name)')
    .eq('user_id', userId);
  if (error) throw error;
  return data.map(({ role, partner }) => ({
    role: role === 'admin' ? 'admin' : 'viewer',
    partner: { id: partner.id, name: partner.name },
  }));
}

function readTimezone(settings: unknown): string {
  const tz = (settings as { timezone?: unknown } | null)?.timezone;
  return typeof tz === 'string' && tz ? tz : 'America/Sao_Paulo';
}
