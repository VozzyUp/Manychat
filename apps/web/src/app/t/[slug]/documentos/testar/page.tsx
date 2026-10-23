import { roleAtLeast } from '@nurion/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { getTenantContext } from '@/lib/tenant-context';
import { TestForm } from './test-form';

export const metadata: Metadata = { title: 'Testar a base · Nurion Hub' };

/** S11 — ask the base a question and see the answer with the passages used. */
export default async function TestBasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const allowed = roleAtLeast(role, 'manager') && tenant.status === 'active';
  return (
    <>
      <Link
        href={`/t/${slug}/documentos`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Documentos
      </Link>
      <PageHeader
        title="Testar a base"
        description="Faça uma pergunta como um colaborador faria. É a mesma busca e a mesma regra de fonte do WhatsApp, sem enviar mensagem."
      />
      {allowed ? (
        <TestForm slug={slug} />
      ) : (
        <Alert tone="info">Só gestores e acima testam a base (cada teste usa a IA).</Alert>
      )}
    </>
  );
}
