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
import { CONTACT_KIND_LABELS, HANDOFF_REASON_LABELS, MODULE_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { CloseHandoffForm } from './handoff-form';
import { MessageBubble, type MessageView } from './message-bubble';

export const metadata: Metadata = { title: 'Conversa · Nurion Hub' };

const MESSAGE_LIMIT = 200;
const SIGNED_URL_SECONDS = 600;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** S05 — one conversation: messages with media and transcription, handoff state. */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ encerrado?: string }>;
}) {
  const { slug, id } = await params;
  const { encerrado } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();

  const [{ data: conversation }, { data: rows }] = await Promise.all([
    supabase
      .from('conversations')
      .select(
        'id, module, agent_key, last_inbound_at, contact:contacts!inner(id, name, profile_name, wa_id, kind, anonymized_at), number:whatsapp_numbers!inner(display_number, verified_name, status), handoffs(id, reason, status, summary, opened_by, opened_at, closed_at)',
      )
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .order('opened_at', { referencedTable: 'handoffs', ascending: false })
      .maybeSingle(),
    supabase
      .from('messages')
      .select(
        'id, direction, author, type, text, transcription, payload, status, error, sent_at, created_at, media:message_media(id, storage_path, mime, filename, status)',
      )
      .eq('tenant_id', tenant.id)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT),
  ]);
  if (!conversation) notFound();

  // Media live in the private bucket: short-lived signed URLs, checked by the storage RLS policy.
  const paths = (rows ?? []).flatMap((m) =>
    m.media.filter((f) => f.status === 'stored' && f.storage_path).map((f) => f.storage_path!),
  );
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from('media')
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const messages: MessageView[] = (rows ?? []).reverse().map((m) => ({
    ...m,
    media: m.media.map((f) => ({
      id: f.id,
      mime: f.mime,
      filename: f.filename,
      status: f.status,
      url: f.storage_path ? urls.get(f.storage_path) : undefined,
    })),
  }));

  const contact = conversation.contact;
  const anonymized = Boolean(contact.anonymized_at);
  const name = anonymized
    ? 'Contato anonimizado'
    : contact.name || contact.profile_name || formatWaId(contact.wa_id);
  const openHandoff = conversation.handoffs.find((h) => h.status === 'open');
  const canOperate = roleAtLeast(role, 'operator') && tenant.status === 'active';
  // Rendered per request: the 24 h window depends on the current time.
  const now = Date.now();
  const windowEnds = conversation.last_inbound_at
    ? new Date(conversation.last_inbound_at).getTime() + WINDOW_MS
    : null;
  const windowOpen = windowEnds !== null && windowEnds > now;

  return (
    <>
      <Link
        href={`/t/${slug}/conversas`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Conversas
      </Link>
      <PageHeader
        title={name}
        description={
          <>
            {anonymized ? null : <>{formatWaId(contact.wa_id)} · </>}
            {CONTACT_KIND_LABELS[contact.kind as ContactKind]} · pelo número{' '}
            {conversation.number.display_number}
          </>
        }
        actions={
          anonymized ? null : (
            <Link
              href={`/t/${slug}/contatos/${contact.id}`}
              className="text-sm font-medium text-accent-text hover:underline"
            >
              Ver contato
            </Link>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Mensagens" className="min-w-0">
          {(rows?.length ?? 0) >= MESSAGE_LIMIT ? (
            <p className="mb-3 text-sm text-muted">
              Mostrando as {MESSAGE_LIMIT} mensagens mais recentes.
            </p>
          ) : null}
          {messages.length ? (
            <ol className="space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} timeZone={tenant.timezone} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nenhuma mensagem nesta conversa.</p>
          )}
        </section>
        <aside className="space-y-4">
          {encerrado === '1' && !openHandoff ? (
            <Alert tone="success">Atendimento humano encerrado. A IA volta a responder.</Alert>
          ) : null}
          {openHandoff ? (
            <Card>
              <CardTitle
                description={`Desde ${formatDateTime(openHandoff.opened_at, tenant.timezone)}. A IA não responde enquanto ele estiver aberto.`}
              >
                Atendimento humano aberto
              </CardTitle>
              <p className="mb-3 text-sm text-text">
                Motivo: {HANDOFF_REASON_LABELS[openHandoff.reason] ?? openHandoff.reason}
              </p>
              {openHandoff.summary ? (
                <p className="mb-3 whitespace-pre-wrap text-sm text-muted">{openHandoff.summary}</p>
              ) : null}
              {canOperate ? (
                <CloseHandoffForm slug={slug} conversationId={conversation.id} />
              ) : null}
            </Card>
          ) : null}
          <Card>
            <CardTitle>Detalhes</CardTitle>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Módulo</dt>
                <dd className="text-text">
                  {conversation.module
                    ? MODULE_LABELS[conversation.module as ModuleKey]
                    : 'Ainda sem módulo'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Janela de 24 h do WhatsApp</dt>
                <dd className="text-text">
                  {windowOpen ? (
                    <>
                      <Badge tone="success">Aberta</Badge> até{' '}
                      {formatDateTime(new Date(windowEnds).toISOString(), tenant.timezone)}
                    </>
                  ) : (
                    <>
                      <Badge>Fechada</Badge> só templates aprovados
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Atendimentos humanos</dt>
                <dd className="text-text">{conversation.handoffs.length}</dd>
              </div>
            </dl>
          </Card>
          {conversation.number.status !== 'active' ? (
            <Alert tone="warning">O número desta conversa está desativado.</Alert>
          ) : null}
        </aside>
      </div>
    </>
  );
}
