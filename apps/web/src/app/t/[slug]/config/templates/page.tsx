import { roleAtLeast } from '@nurion/shared';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { AddTemplateForm, DeleteTemplateButton, SyncButton } from './template-forms';

export const metadata: Metadata = { title: 'Templates · Nurion Hub' };

const STATUS = {
  approved: { label: 'Aprovado', tone: 'success' },
  pending: { label: 'Em análise', tone: 'warning' },
  rejected: { label: 'Rejeitado', tone: 'danger' },
  paused: { label: 'Pausado', tone: 'warning' },
  disabled: { label: 'Desativado', tone: 'neutral' },
} as const;
const CATEGORY: Record<string, string> = {
  utility: 'Utilidade',
  marketing: 'Marketing',
  authentication: 'Autenticação',
};

/** S22 — WhatsApp templates (needed to message contacts outside the 24 h window). */
export default async function TemplatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const [{ data: templates }, { data: numbers }] = await Promise.all([
    supabase
      .from('whatsapp_templates')
      .select(
        'id, name, language, category, body, status, variables_count, rejected_reason, last_synced_at',
      )
      .eq('tenant_id', tenant.id)
      .order('name'),
    supabase.from('whatsapp_numbers').select('waba_id').eq('tenant_id', tenant.id),
  ]);
  const wabas = [...new Set((numbers ?? []).map((n) => n.waba_id))];
  const canEdit = roleAtLeast(role, 'admin') && tenant.status === 'active';

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text">Templates</h2>
            <p className="text-sm text-muted">
              Fora da janela de 24 horas, o WhatsApp só permite mensagens aprovadas pela Meta.
            </p>
          </div>
          {canEdit && wabas.length ? <SyncButton slug={slug} /> : null}
        </div>
        {templates?.length ? (
          <ul className="divide-y divide-border">
            {templates.map((t) => {
              const status = STATUS[t.status as keyof typeof STATUS] ?? STATUS.pending;
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-mono text-sm font-semibold text-text">{t.name}</p>
                    <p className="text-sm text-muted">
                      {CATEGORY[t.category] ?? t.category} · {t.language} · {t.variables_count}{' '}
                      variável(is)
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-text">{t.body || '—'}</p>
                    {t.rejected_reason ? (
                      <p className="text-sm text-danger">Motivo: {t.rejected_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {canEdit ? <DeleteTemplateButton slug={slug} id={t.id} name={t.name} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nenhum template ainda. Conecte um número e sincronize com a Meta.
          </p>
        )}
      </Card>
      {canEdit && wabas.length ? (
        <Card>
          <CardTitle description="Registre aqui e crie o mesmo template no Meta Business para aprovação.">
            Novo template
          </CardTitle>
          <AddTemplateForm slug={slug} wabas={wabas} />
        </Card>
      ) : null}
    </div>
  );
}
