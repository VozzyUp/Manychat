import { formatWaId } from '@nurion/shared/phone';
import { moduleKeySchema, type ContactKind, type ModuleKey } from '@nurion/shared/domain';
import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { formatDateTime, pageFrom } from '@/lib/format';
import { CONTACT_KIND_LABELS, HANDOFF_REASON_LABELS, MODULE_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';

export const metadata: Metadata = { title: 'Conversas · Nurion Hub' };

const PAGE_SIZE = 30;

type Search = { modulo?: string; atendimento?: string; page?: string };

/** S04 — WhatsApp conversations of the tenant, newest first, filtered by module and handoff. */
export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { tenant } = await getTenantContext(slug);
  const moduleFilter = moduleKeySchema.safeParse(search.modulo);
  const withoutModule = search.modulo === 'nenhum';
  const humanOnly = search.atendimento === 'humano';
  const page = pageFrom(search.page);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('conversations')
    .select(
      'id, module, agent_key, last_message_at, contact:contacts!inner(id, name, profile_name, wa_id, kind, anonymized_at), handoffs(id, reason, status, opened_at)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenant.id)
    .eq('handoffs.status', 'open')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (moduleFilter.success) query = query.eq('module', moduleFilter.data);
  if (withoutModule) query = query.is('module', null);
  // Only conversations that have an open handoff (embedded filter acts as an inner join).
  if (humanOnly) query = query.not('handoffs', 'is', null);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const conversations = data ?? [];
  const filtered = moduleFilter.success || withoutModule || humanOnly;

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Atendimentos pelo WhatsApp. A IA não responde enquanto houver atendimento humano aberto."
      />
      <Form action={`/t/${slug}/conversas`} className="mb-4 flex flex-wrap items-end gap-3">
        <SelectField
          id="modulo"
          label="Módulo"
          defaultValue={moduleFilter.success ? moduleFilter.data : withoutModule ? 'nenhum' : ''}
          className="w-52"
        >
          <option value="">Todos</option>
          {tenant.modules.map((m) => (
            <option key={m} value={m}>
              {MODULE_LABELS[m]}
            </option>
          ))}
          <option value="nenhum">Ainda sem módulo</option>
        </SelectField>
        <SelectField
          id="atendimento"
          label="Atendimento"
          defaultValue={humanOnly ? 'humano' : ''}
          className="w-60"
        >
          <option value="">Todos</option>
          <option value="humano">Com atendimento humano aberto</option>
        </SelectField>
        <button type="submit" className={buttonClass('secondary')}>
          Filtrar
        </button>
        {filtered ? (
          <Link
            href={`/t/${slug}/conversas`}
            className="py-2 text-sm text-accent-text hover:underline"
          >
            Limpar filtros
          </Link>
        ) : null}
      </Form>
      <Card flush>
        {conversations.length ? (
          <ul className="divide-y divide-border" aria-label="Conversas">
            {conversations.map((c) => {
              const contact = c.contact;
              const open = c.handoffs[0];
              const anonymized = Boolean(contact.anonymized_at);
              const name = anonymized
                ? 'Contato anonimizado'
                : contact.name || contact.profile_name || formatWaId(contact.wa_id);
              return (
                <li key={c.id}>
                  <Link
                    href={`/t/${slug}/conversas/${c.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text">{name}</p>
                      <p className="text-sm text-muted">
                        {anonymized ? '—' : formatWaId(contact.wa_id)} ·{' '}
                        {CONTACT_KIND_LABELS[contact.kind as ContactKind]}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {open ? (
                        <Badge tone="warning">
                          Humano: {HANDOFF_REASON_LABELS[open.reason] ?? open.reason}
                        </Badge>
                      ) : null}
                      <Badge>
                        {c.module ? MODULE_LABELS[c.module as ModuleKey] : 'Sem módulo'}
                      </Badge>
                      <span className="text-sm text-muted">
                        {formatDateTime(c.last_message_at, tenant.timezone)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {filtered
              ? 'Nenhuma conversa com esses filtros.'
              : 'Nenhuma conversa ainda. Elas aparecem aqui quando alguém escreve para um número conectado.'}
          </p>
        )}
      </Card>
      <Pagination
        basePath={`/t/${slug}/conversas`}
        params={{ modulo: search.modulo, atendimento: search.atendimento }}
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
      />
    </>
  );
}
