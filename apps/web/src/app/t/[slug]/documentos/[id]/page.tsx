import { roleAtLeast } from '@nurion/shared';
import type { Collection } from '@nurion/shared/domain';
import { ArrowLeft, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { formatBytes, reviewOverdue, todayIn } from '@/lib/documents';
import { formatDate, formatDateTime } from '@/lib/format';
import { COLLECTION_LABELS, DOCUMENT_STATUS_LABELS, INGEST_STATUS_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import {
  AddVersionForm,
  AutoRefresh,
  ReingestButton,
  TransitionButton,
  UpdateDocumentForm,
  VersionDatesForm,
} from '../document-forms';

export const metadata: Metadata = { title: 'Documento · Nurion Hub' };

const SIGNED_URL_SECONDS = 600;

/** S09 — one document: data, versions with the approval workflow, and the ingestion status. */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();

  const [{ data: document }, { data: members }] = await Promise.all([
    supabase
      .from('documents')
      .select(
        'id, collection, code, title, tags, owner_user_id, current_version_id, versions:document_versions!document_versions_tenant_id_document_id_fkey(id, version, status, filename, size, storage_path, effective_date, review_date, summary, ingest_status, ingest_error, chunk_count, approved_at, activated_at, created_at)',
      )
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .order('version', { referencedTable: 'document_versions', ascending: false })
      .maybeSingle(),
    supabase
      .from('tenant_members')
      .select('user_id, profile:profiles(full_name, email)')
      .eq('tenant_id', tenant.id)
      .order('created_at'),
  ]);
  if (!document) notFound();

  const owners = (members ?? []).map((m) => ({
    userId: m.user_id,
    name: m.profile?.full_name || m.profile?.email || 'Sem nome',
  }));
  const active = tenant.status === 'active';
  const canEdit = roleAtLeast(role, 'operator') && active;
  const canApprove = roleAtLeast(role, 'quality') && active;
  const canReingest = roleAtLeast(role, 'admin') && active;
  const today = todayIn(tenant.timezone);

  const paths = document.versions.map((v) => v.storage_path);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const processing = document.versions.some(
    (v) =>
      v.status === 'aprovado' &&
      (v.ingest_status === 'pending' || v.ingest_status === 'processing'),
  );
  const owner = owners.find((o) => o.userId === document.owner_user_id);

  return (
    <>
      <AutoRefresh active={processing} />
      <Link
        href={`/t/${slug}/documentos`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Documentos
      </Link>
      <PageHeader
        title={document.title}
        description={
          <>
            {document.code ? `${document.code} · ` : ''}
            {COLLECTION_LABELS[document.collection as Collection]}
            {owner ? ` · responsável: ${owner.name}` : ''}
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardTitle
            description={`${document.versions.length} ${document.versions.length === 1 ? 'versão' : 'versões'}. A IA usa a versão aprovada e processada mais recente.`}
          >
            Versões
          </CardTitle>
          <ul className="divide-y divide-border" aria-label="Versões">
            {document.versions.map((v) => {
              const feeding = v.status === 'aprovado' && Boolean(v.activated_at);
              const url = urls.get(v.storage_path);
              return (
                <li key={v.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-text">Versão {v.version}</p>
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <FileText aria-hidden size={14} />
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-accent-text hover:underline"
                          >
                            {v.filename}
                          </a>
                        ) : (
                          <span className="truncate">{v.filename}</span>
                        )}
                        · {formatBytes(v.size)} · enviada em{' '}
                        {formatDateTime(v.created_at, tenant.timezone)}
                      </p>
                      <p className="text-sm text-muted">
                        Vigência: {formatDate(v.effective_date, 'UTC')} · revisão:{' '}
                        {formatDate(v.review_date, 'UTC')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {reviewOverdue(v, today) ? (
                        <Badge tone="danger">Revisão vencida</Badge>
                      ) : null}
                      {feeding ? <Badge tone="accent">Em uso pela IA</Badge> : null}
                      <Badge
                        tone={
                          v.status === 'aprovado'
                            ? 'success'
                            : v.status === 'obsoleto'
                              ? 'neutral'
                              : 'warning'
                        }
                      >
                        {DOCUMENT_STATUS_LABELS[v.status as keyof typeof DOCUMENT_STATUS_LABELS]}
                      </Badge>
                    </div>
                  </div>

                  {v.status === 'aprovado' ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-text">
                        Processamento:{' '}
                        <strong>{INGEST_STATUS_LABELS[v.ingest_status] ?? v.ingest_status}</strong>
                        {v.ingest_status === 'ready' ? ` · ${v.chunk_count} trechos` : ''}
                        {v.approved_at
                          ? ` · aprovada em ${formatDateTime(v.approved_at, tenant.timezone)}`
                          : ''}
                      </p>
                      {v.ingest_status === 'ready' && !v.activated_at ? (
                        <p className="text-muted">Pronta, mas já não é a versão vigente.</p>
                      ) : null}
                      {v.ingest_status === 'failed' && v.ingest_error ? (
                        <Alert tone="error">{v.ingest_error}</Alert>
                      ) : null}
                      {(v.ingest_status === 'pending' || v.ingest_status === 'processing') &&
                      !feeding ? (
                        <p className="text-muted">
                          A versão anterior continua valendo até esta ficar pronta.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {v.summary ? <p className="text-sm text-text">{v.summary}</p> : null}

                  {canEdit && (v.status === 'rascunho' || v.status === 'em_revisao') ? (
                    <VersionDatesForm slug={slug} documentId={document.id} version={v} />
                  ) : null}
                  <div className="flex flex-wrap items-start gap-3">
                    {canEdit && v.status === 'rascunho' ? (
                      <TransitionButton
                        slug={slug}
                        documentId={document.id}
                        versionId={v.id}
                        to="em_revisao"
                      >
                        Enviar para revisão
                      </TransitionButton>
                    ) : null}
                    {canApprove && v.status === 'em_revisao' ? (
                      <>
                        <TransitionButton
                          slug={slug}
                          documentId={document.id}
                          versionId={v.id}
                          to="aprovado"
                        >
                          Aprovar
                        </TransitionButton>
                        <TransitionButton
                          slug={slug}
                          documentId={document.id}
                          versionId={v.id}
                          to="rascunho"
                        >
                          Devolver para rascunho
                        </TransitionButton>
                      </>
                    ) : null}
                    {canApprove && (v.status === 'aprovado' || v.status === 'rascunho') ? (
                      <TransitionButton
                        slug={slug}
                        documentId={document.id}
                        versionId={v.id}
                        to="obsoleto"
                        confirm="Tornar esta versão obsoleta? A IA deixa de usá-la e isso não pode ser desfeito."
                      >
                        Tornar obsoleta
                      </TransitionButton>
                    ) : null}
                    {canReingest &&
                    v.status === 'aprovado' &&
                    (v.ingest_status === 'failed' || v.ingest_status === 'pending') ? (
                      <ReingestButton slug={slug} documentId={document.id} versionId={v.id} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {canEdit ? (
          <>
            <Card>
              <CardTitle description="A nova versão entra como rascunho e passa pela revisão antes de valer.">
                Nova versão
              </CardTitle>
              <AddVersionForm slug={slug} documentId={document.id} />
            </Card>
            <Card>
              <CardTitle>Dados do documento</CardTitle>
              <UpdateDocumentForm
                slug={slug}
                owners={owners}
                document={{
                  id: document.id,
                  title: document.title,
                  collection: document.collection as Collection,
                  code: document.code,
                  owner_user_id: document.owner_user_id,
                  tags: document.tags,
                }}
              />
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}
