import { roleAtLeast } from '@nurion/shared';
import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { MODULE_DESCRIPTIONS, MODULE_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';

/** S03 — tenant home. KPIs arrive with the WhatsApp and document steps; for now: setup checklist. */
export default async function TenantHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { count: members } = await supabase
    .from('tenant_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  const steps = [
    { done: (members ?? 0) > 1, label: 'Convidar a equipe', href: `/t/${slug}/config/membros` },
    {
      done: Boolean(tenant.branding.logoUrl),
      label: 'Colocar o logo e as cores da empresa',
      href: `/t/${slug}/config`,
    },
    { done: false, label: 'Conectar o número de WhatsApp', soon: true },
    { done: false, label: 'Enviar os documentos aprovados (POPs, manuais)', soon: true },
  ];
  const canConfigure = roleAtLeast(role, 'admin');

  return (
    <>
      <PageHeader title={tenant.name} description="Visão geral da empresa no Nurion Hub." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle description="O que falta para a IA começar a atender pelo WhatsApp.">
            Primeiros passos
          </CardTitle>
          <ul className="space-y-3">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                {step.done ? (
                  <CheckCircle2 aria-hidden size={18} className="text-success" />
                ) : (
                  <Circle aria-hidden size={18} className="text-muted" />
                )}
                <span className="sr-only">{step.done ? 'Concluído:' : 'Pendente:'}</span>
                {step.href && canConfigure && !step.done ? (
                  <Link href={step.href} className="font-medium text-accent-text hover:underline">
                    {step.label}
                  </Link>
                ) : (
                  <span className={step.done ? 'text-muted line-through' : 'text-text'}>
                    {step.label}
                  </span>
                )}
                {step.soon ? <Badge>em breve</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle description="Contratados pela sua empresa.">Módulos</CardTitle>
          {tenant.modules.length ? (
            <ul className="space-y-3">
              {tenant.modules.map((m) => (
                <li key={m} className="text-sm">
                  <p className="font-medium text-text">{MODULE_LABELS[m]}</p>
                  <p className="text-muted">{MODULE_DESCRIPTIONS[m]}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Nenhum módulo ativo. Fale com a Nurion para contratar.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
