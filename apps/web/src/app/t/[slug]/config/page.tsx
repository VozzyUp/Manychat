import { parseBranding, roleAtLeast } from '@nurion/shared';
import type { Metadata } from 'next';
import { Card, CardTitle } from '@/components/ui/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { GeneralForm } from './general-form';
import { LogoForm } from './logo-form';

export const metadata: Metadata = { title: 'Configurações · Nurion Hub' };

/** S19 — general settings and white-label. */
export default async function GeneralConfigPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tenants')
    .select('name, branding, settings, partner:partners(branding)')
    .eq('id', tenant.id)
    .single();

  const own = parseBranding(data?.branding);
  const partner = parseBranding(data?.partner?.branding);
  const settings = (data?.settings ?? {}) as {
    timezone?: string;
    business_hours?: string;
    rules?: string;
  };
  const canEdit = roleAtLeast(role, 'admin') && tenant.status === 'active';

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardTitle>Geral e marca</CardTitle>
        <GeneralForm
          slug={slug}
          canEdit={canEdit}
          values={{
            name: data?.name ?? tenant.name,
            brandName: own.name ?? '',
            primary: own.primary ?? '',
            inheritedAccent: partner.primary ?? tenant.branding.accent,
            timezone: settings.timezone ?? tenant.timezone,
            businessHours: settings.business_hours ?? '',
            rules: settings.rules ?? '',
          }}
        />
      </Card>
      <Card>
        <CardTitle description="Aparece no topo do painel.">Logo</CardTitle>
        <LogoForm slug={slug} logoUrl={own.logo_url ?? null} canEdit={canEdit} />
      </Card>
    </div>
  );
}
