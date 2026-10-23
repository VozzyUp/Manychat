import { roleAtLeast } from '@nurion/shared';
import type { ContactKind, ModuleKey } from '@nurion/shared/domain';
import { formatWaId } from '@nurion/shared/phone';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { formatDateTime } from '@/lib/format';
import { CONSENT_TYPE_LABELS, CONTACT_KIND_LABELS, MODULE_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { AnonymizeForm, EditContactForm } from '../contact-forms';

export const metadata: Metadata = { title: 'Contato · Nurion Hub' };

/** S07 — contact profile, consents, conversations and LGPD anonymization (§10). */
export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ anonimizado?: string }>;
}) {
  const { slug, id } = await params;
  const { anonimizado } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from('contacts')
    .select(
      'id, wa_id, name, profile_name, kind, anonymized_at, created_at, consents(id, type, version, channel, accepted_at, revoked_at), conversations(id, module, last_message_at, number:whatsapp_numbers!inner(display_number))',
    )
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .order('last_message_at', { referencedTable: 'conversations', ascending: false })
    .order('accepted_at', { referencedTable: 'consents', ascending: false })
    .maybeSingle();
  if (!contact) notFound();

  const anonymized = Boolean(contact.anonymized_at);
  const active = tenant.status === 'active';
  const canEdit = roleAtLeast(role, 'operator') && active && !anonymized;
  const canAnonymize = roleAtLeast(role, 'admin') && active && !anonymized;
  const title = anonymized
    ? 'Contato anonimizado'
    : contact.name || contact.profile_name || formatWaId(contact.wa_id);

  return (
    <>
      <Link
        href={`/t/${slug}/contatos`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Contatos
      </Link>
      <PageHeader
        title={title}
        description={
          anonymized
            ? `Dados pessoais removidos em ${formatDateTime(contact.anonymized_at, tenant.timezone)}.`
            : `${formatWaId(contact.wa_id)} · ${CONTACT_KIND_LABELS[contact.kind as ContactKind]}`
        }
      />
      {anonymized && anonimizado !== undefined ? (
        <div className="mb-6">
          <Alert tone="success">
            Dados pessoais removidos.{' '}
            {Number(anonimizado) > 0
              ? `${Number(anonimizado)} arquivo(s) de mídia apagado(s).`
              : 'Não havia arquivos de mídia.'}
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle
            description={
              contact.profile_name && !anonymized
                ? `Nome no perfil do WhatsApp: ${contact.profile_name}`
                : undefined
            }
          >
            Cadastro
          </CardTitle>
          {canEdit ? (
            <EditContactForm
              slug={slug}
              contact={{ id: contact.id, name: contact.name, kind: contact.kind as ContactKind }}
            />
          ) : anonymized ? (
            <Alert>Este contato foi anonimizado a pedido do titular e não pode ser alterado.</Alert>
          ) : (
            <p className="text-sm text-muted">
              Tipo: {CONTACT_KIND_LABELS[contact.kind as ContactKind]}
            </p>
          )}
        </Card>
        <Card>
          <CardTitle description="Aceites registrados pelo WhatsApp ou pelo painel (LGPD).">
            Consentimentos
          </CardTitle>
          {contact.consents.length ? (
            <ul className="divide-y divide-border text-sm">
              {contact.consents.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-text">
                    {CONSENT_TYPE_LABELS[c.type] ?? c.type} · versão {c.version}
                  </span>
                  <span className="flex items-center gap-2 text-muted">
                    {formatDateTime(c.accepted_at, tenant.timezone)}
                    <Badge tone={c.revoked_at ? 'neutral' : 'success'}>
                      {c.revoked_at ? 'Revogado' : 'Aceito'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhum consentimento registrado.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Conversas</CardTitle>
          {contact.conversations.length ? (
            <ul className="divide-y divide-border text-sm">
              {contact.conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/t/${slug}/conversas/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 hover:underline"
                  >
                    <span className="text-text">
                      Pelo número {c.number.display_number} ·{' '}
                      {c.module ? MODULE_LABELS[c.module as ModuleKey] : 'Sem módulo'}
                    </span>
                    <span className="text-muted">
                      {formatDateTime(c.last_message_at, tenant.timezone)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Este contato ainda não conversou com a empresa.</p>
          )}
        </Card>
        {canAnonymize ? (
          <Card>
            <CardTitle description="Use quando o titular pedir a exclusão dos dados (LGPD). O histórico fica, sem dados pessoais.">
              Anonimizar contato
            </CardTitle>
            <AnonymizeForm slug={slug} contactId={contact.id} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
