import { roleAtLeast } from '@nurion/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { formatDateTime } from '@/lib/format';
import { GAP_REASON_LABELS } from '@/lib/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { GapButton } from './gap-button';

export const metadata: Metadata = { title: 'Perguntas sem resposta · Nurion Hub' };

/** S12 — questions that fell into a human handoff for lack of base, to complete the documentation. */
export default async function GapsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ situacao?: string }>;
}) {
  const { slug } = await params;
  const { situacao } = await searchParams;
  const { tenant, role } = await getTenantContext(slug);
  const allowed = roleAtLeast(role, 'quality');
  const showResolved = situacao === 'resolvidas';

  let gaps: {
    id: string;
    question: string;
    reason: string;
    status: string;
    created_at: string;
    conversation_id: string | null;
  }[] = [];
  if (allowed) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('knowledge_gaps')
      .select('id, question, reason, status, created_at, conversation_id')
      .eq('tenant_id', tenant.id)
      .eq('status', showResolved ? 'resolved' : 'open')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    gaps = data ?? [];
  }
  const canResolve = allowed && tenant.status === 'active';

  return (
    <>
      <Link
        href={`/t/${slug}/documentos`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Documentos
      </Link>
      <PageHeader
        title="Perguntas sem resposta"
        description="Perguntas que a IA não conseguiu responder com a base e passou para uma pessoa. Complete os documentos e marque como resolvida."
      />
      {!allowed ? (
        <Alert tone="info">Só a Qualidade (ou acima) vê as perguntas sem resposta.</Alert>
      ) : (
        <>
          <nav aria-label="Situação" className="mb-4 flex gap-2 text-sm">
            <Link
              href={`/t/${slug}/documentos/lacunas`}
              aria-current={showResolved ? undefined : 'page'}
              className={
                showResolved ? 'text-muted hover:text-text' : 'font-semibold text-accent-text'
              }
            >
              Abertas
            </Link>
            <span aria-hidden className="text-muted">
              ·
            </span>
            <Link
              href={`/t/${slug}/documentos/lacunas?situacao=resolvidas`}
              aria-current={showResolved ? 'page' : undefined}
              className={
                showResolved ? 'font-semibold text-accent-text' : 'text-muted hover:text-text'
              }
            >
              Resolvidas
            </Link>
          </nav>
          <Card flush>
            {gaps.length ? (
              <ul className="divide-y divide-border" aria-label="Perguntas">
                {gaps.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="whitespace-pre-wrap text-sm font-medium text-text">
                        {g.question}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                        <Badge tone="warning">{GAP_REASON_LABELS[g.reason] ?? g.reason}</Badge>
                        {formatDateTime(g.created_at, tenant.timezone)}
                        {g.conversation_id ? (
                          <Link
                            href={`/t/${slug}/conversas/${g.conversation_id}`}
                            className="text-accent-text hover:underline"
                          >
                            Ver conversa
                          </Link>
                        ) : null}
                      </p>
                    </div>
                    {canResolve ? (
                      <GapButton slug={slug} gapId={g.id} to={showResolved ? 'open' : 'resolved'} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">
                {showResolved
                  ? 'Nenhuma pergunta resolvida ainda.'
                  : 'Nenhuma pergunta sem resposta. 🎉'}
              </p>
            )}
          </Card>
        </>
      )}
    </>
  );
}
