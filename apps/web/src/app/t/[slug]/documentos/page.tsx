import { roleAtLeast } from '@nurion/shared';
import { COLLECTIONS, collectionSchema, type Collection } from '@nurion/shared/domain';
import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { headlineVersion, reviewOverdue, todayIn } from '@/lib/documents';
import { formatDate, pageFrom } from '@/lib/format';
import { COLLECTION_LABELS, DOCUMENT_STATUS_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';

export const metadata: Metadata = { title: 'Documentos · Nurion Hub' };

const PAGE_SIZE = 25;
const STATUSES = ['rascunho', 'em_revisao', 'aprovado', 'obsoleto'] as const;

type Search = { colecao?: string; situacao?: string; revisao?: string; q?: string; page?: string };

/** S08 — documents of the tenant: collection, status of the headline version, overdue reviews. */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { tenant, role } = await getTenantContext(slug);
  const collection = collectionSchema.safeParse(search.colecao);
  const status = STATUSES.find((s) => s === search.situacao);
  const overdueOnly = search.revisao === 'vencida';
  const q = (search.q ?? '').trim().toLowerCase().slice(0, 60);
  const page = pageFrom(search.page);
  const today = todayIn(tenant.timezone);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('documents')
    .select(
      'id, collection, code, title, tags, versions:document_versions!document_versions_tenant_id_document_id_fkey(version, status, review_date, ingest_status, activated_at)',
    )
    .eq('tenant_id', tenant.id)
    .order('title')
    .limit(500);
  if (collection.success) query = query.eq('collection', collection.data);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((d) => ({ ...d, head: headlineVersion(d.versions) }))
    .filter((d) => !status || d.head?.status === status)
    .filter((d) => !overdueOnly || reviewOverdue(d.head, today))
    .filter(
      (d) =>
        !q ||
        d.title.toLowerCase().includes(q) ||
        (d.code ?? '').toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = collection.success || Boolean(status) || overdueOnly || Boolean(q);
  const canCreate = roleAtLeast(role, 'operator') && tenant.status === 'active';

  return (
    <>
      <PageHeader
        title="Documentos"
        description="POPs, manuais e normas da empresa. Só versões aprovadas e processadas alimentam a IA."
        actions={
          canCreate ? (
            <Link href={`/t/${slug}/documentos/novo`} className={buttonClass('primary')}>
              Novo documento
            </Link>
          ) : undefined
        }
      />
      <Form action={`/t/${slug}/documentos`} className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium text-text">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Título, código ou etiqueta"
            className="block h-10 w-60 rounded-md border border-border-input bg-bg px-3 text-sm text-text placeholder:text-muted"
          />
        </div>
        <SelectField
          id="colecao"
          label="Coleção"
          defaultValue={collection.success ? collection.data : ''}
          className="w-48"
        >
          <option value="">Todas</option>
          {COLLECTIONS.map((c) => (
            <option key={c} value={c}>
              {COLLECTION_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <SelectField id="situacao" label="Situação" defaultValue={status ?? ''} className="w-44">
          <option value="">Todas</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {DOCUMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="revisao"
          label="Revisão"
          defaultValue={overdueOnly ? 'vencida' : ''}
          className="w-44"
        >
          <option value="">Todas</option>
          <option value="vencida">Vencida</option>
        </SelectField>
        <button type="submit" className={buttonClass('secondary')}>
          Filtrar
        </button>
        {filtered ? (
          <Link
            href={`/t/${slug}/documentos`}
            className="py-2 text-sm text-accent-text hover:underline"
          >
            Limpar filtros
          </Link>
        ) : null}
      </Form>
      <Card flush>
        {pageRows.length ? (
          <ul className="divide-y divide-border" aria-label="Documentos">
            {pageRows.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/t/${slug}/documentos/${d.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {d.code ? `${d.code} · ` : ''}
                      {d.title}
                    </p>
                    <p className="text-sm text-muted">
                      {COLLECTION_LABELS[d.collection as Collection]}
                      {d.head ? ` · versão ${d.head.version}` : ''}
                      {d.head?.review_date
                        ? ` · revisão em ${formatDate(d.head.review_date, 'UTC')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {reviewOverdue(d.head, today) ? (
                      <Badge tone="danger">Revisão vencida</Badge>
                    ) : null}
                    {d.head?.status === 'aprovado' && d.head.ingest_status === 'failed' ? (
                      <Badge tone="danger">Falha no processamento</Badge>
                    ) : null}
                    {d.head?.status === 'aprovado' &&
                    !d.head.activated_at &&
                    d.head.ingest_status !== 'failed' ? (
                      <Badge tone="warning">Processando</Badge>
                    ) : null}
                    {d.head ? (
                      <Badge
                        tone={
                          d.head.status === 'aprovado'
                            ? 'success'
                            : d.head.status === 'obsoleto'
                              ? 'neutral'
                              : 'warning'
                        }
                      >
                        {
                          DOCUMENT_STATUS_LABELS[
                            d.head.status as keyof typeof DOCUMENT_STATUS_LABELS
                          ]
                        }
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {filtered
              ? 'Nenhum documento com esses filtros.'
              : 'Nenhum documento ainda. Envie o primeiro POP ou manual.'}
          </p>
        )}
      </Card>
      <Pagination
        basePath={`/t/${slug}/documentos`}
        params={{
          q: q || undefined,
          colecao: search.colecao,
          situacao: search.situacao,
          revisao: search.revisao,
        }}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
      />
    </>
  );
}
