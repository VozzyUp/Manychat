import { MODULES, roleAtLeast } from '@nurion/shared';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { MODULE_DESCRIPTIONS, MODULE_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { AddDepartmentForm, DepartmentRow } from './department-forms';

export const metadata: Metadata = { title: 'Módulos e setores · Nurion Hub' };

/** S23 — contracted modules (read-only for the tenant) and departments. */
export default async function ModulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('tenant_id', tenant.id)
    .order('name');
  const canEdit = roleAtLeast(role, 'admin') && tenant.status === 'active';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle description="Para contratar ou cancelar um módulo, fale com a Nurion.">
          Módulos
        </CardTitle>
        <ul className="divide-y divide-border">
          {MODULES.map((m) => {
            const active = tenant.modules.includes(m);
            return (
              <li key={m} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-text">{MODULE_LABELS[m]}</p>
                  <p className="text-sm text-muted">{MODULE_DESCRIPTIONS[m]}</p>
                </div>
                <Badge tone={active ? 'success' : 'neutral'}>
                  {active ? 'Ativo' : 'Não contratado'}
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardTitle description="Usados para encaminhar solicitações e não conformidades.">
          Setores
        </CardTitle>
        {canEdit ? <AddDepartmentForm slug={slug} /> : null}
        <ul className="mt-2 divide-y divide-border">
          {(departments ?? []).map((d) => (
            <DepartmentRow key={d.id} slug={slug} id={d.id} name={d.name} canEdit={canEdit} />
          ))}
          {departments?.length ? null : (
            <li className="py-3 text-sm text-muted">Nenhum setor cadastrado.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
