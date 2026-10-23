import { roleAtLeast } from '@nurion/shared';
import type { Metadata } from 'next';
import { Card, CardTitle } from '@/components/ui/card';
import { serverEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { AddNumberForm, NumberRow, type NumberView } from './number-forms';

export const metadata: Metadata = { title: 'WhatsApp · Nurion Hub' };

/** S21 — WhatsApp numbers of the tenant (token write-only). */
export default async function WhatsAppNumbersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select(
      'id, display_number, phone_number_id, waba_id, verified_name, verified_at, status, default_module, token_last4',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at');
  const numbers: NumberView[] = data ?? [];
  const canEdit = roleAtLeast(role, 'admin') && tenant.status === 'active';

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle description="Mensagens que chegam nestes números são atendidas pela IA da empresa.">
          Números conectados
        </CardTitle>
        {numbers.length ? (
          <ul className="divide-y divide-border">
            {numbers.map((n) => (
              <NumberRow
                key={n.id}
                slug={slug}
                number={n}
                modules={tenant.modules}
                canEdit={canEdit}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum número conectado ainda.</p>
        )}
      </Card>
      {canEdit ? (
        <Card>
          <CardTitle description="Use um número da WhatsApp Cloud API oficial da Meta.">
            Conectar número
          </CardTitle>
          <AddNumberForm slug={slug} modules={tenant.modules} />
        </Card>
      ) : null}
      <Card>
        <CardTitle>Configuração do webhook na Meta</CardTitle>
        <p className="text-sm text-text">
          No app da Meta, em WhatsApp → Configuração, use a URL de callback abaixo e assine o campo{' '}
          <code className="font-mono">messages</code>. O token de verificação é configurado pela
          Nurion.
        </p>
        <p className="mt-2 break-all rounded-md bg-surface px-3 py-2 font-mono text-sm text-text">
          {serverEnv().API_URL}/webhooks/whatsapp
        </p>
      </Card>
    </div>
  );
}
