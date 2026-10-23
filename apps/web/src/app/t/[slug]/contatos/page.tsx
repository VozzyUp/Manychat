import { roleAtLeast } from '@nurion/shared';
import { CONTACT_KINDS, contactKindSchema, type ContactKind } from '@nurion/shared/domain';
import { formatWaId } from '@nurion/shared/phone';
import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { cleanSearch, formatDate, pageFrom } from '@/lib/format';
import { CONTACT_KIND_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { CreateContactForm } from './contact-forms';

export const metadata: Metadata = { title: 'Contatos · Nurion Hub' };

const PAGE_SIZE = 30;

type Search = { q?: string; tipo?: string; page?: string };

/** S06 — contacts: search, filter by kind, register (motoristas, pacientes, equipe). */
export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { tenant, role } = await getTenantContext(slug);
  const q = cleanSearch(search.q);
  const kind = contactKindSchema.safeParse(search.tipo);
  const page = pageFrom(search.page);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('contacts')
    .select('id, wa_id, name, profile_name, kind, anonymized_at, created_at', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (kind.success) query = query.eq('kind', kind.data);
  if (q) {
    const digits = q.replace(/\D/g, '');
    const terms = [`name.ilike.*${q}*`, `profile_name.ilike.*${q}*`];
    if (digits.length >= 4) terms.push(`wa_id.like.*${digits}*`);
    query = query.or(terms.join(','));
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const contacts = data ?? [];
  const filtered = Boolean(q) || kind.success;
  const canCreate = roleAtLeast(role, 'operator') && tenant.status === 'active';

  return (
    <>
      <PageHeader
        title="Contatos"
        description="Quem fala com a empresa pelo WhatsApp. O tipo define qual agente atende."
      />
      <div className="space-y-6">
        {canCreate ? (
          <Card>
            <CardTitle description="Cadastre motoristas, pacientes ou pessoas da equipe antes que escrevam.">
              Novo contato
            </CardTitle>
            <CreateContactForm slug={slug} />
          </Card>
        ) : null}
        <div>
          <Form action={`/t/${slug}/contatos`} className="mb-4 flex flex-wrap items-end gap-3">
            <TextField
              id="q"
              label="Buscar"
              type="search"
              defaultValue={q}
              placeholder="Nome ou número"
              className="w-64"
            />
            <SelectField
              id="tipo"
              label="Tipo de contato"
              defaultValue={kind.success ? kind.data : ''}
              className="w-48"
            >
              <option value="">Todos</option>
              {CONTACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTACT_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
            <button type="submit" className={buttonClass('secondary')}>
              Filtrar
            </button>
            {filtered ? (
              <Link
                href={`/t/${slug}/contatos`}
                className="py-2 text-sm text-accent-text hover:underline"
              >
                Limpar filtros
              </Link>
            ) : null}
          </Form>
          <Card flush>
            {contacts.length ? (
              <ul className="divide-y divide-border" aria-label="Contatos">
                {contacts.map((c) => {
                  const anonymized = Boolean(c.anonymized_at);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/t/${slug}/contatos/${c.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text">
                            {anonymized
                              ? 'Contato anonimizado'
                              : c.name || c.profile_name || 'Sem nome'}
                          </p>
                          <p className="text-sm text-muted">
                            {anonymized ? '—' : formatWaId(c.wa_id)} · desde{' '}
                            {formatDate(c.created_at, tenant.timezone)}
                          </p>
                        </div>
                        <Badge tone={c.kind === 'unknown' ? 'warning' : 'neutral'}>
                          {CONTACT_KIND_LABELS[c.kind as ContactKind]}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">
                {filtered ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda.'}
              </p>
            )}
          </Card>
          <Pagination
            basePath={`/t/${slug}/contatos`}
            params={{ q: q || undefined, tipo: search.tipo }}
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
          />
        </div>
      </div>
    </>
  );
}
