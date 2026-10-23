import { roleAtLeast } from '@nurion/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { CreateDocumentForm } from '../document-forms';

export const metadata: Metadata = { title: 'Novo documento · Nurion Hub' };

/** S10 — upload of a new document (PDF, DOCX, TXT, MD) with its metadata. */
export default async function NewDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tenant_members')
    .select('user_id, profile:profiles(full_name, email)')
    .eq('tenant_id', tenant.id)
    .order('created_at');
  const owners = (data ?? []).map((m) => ({
    userId: m.user_id,
    name: m.profile?.full_name || m.profile?.email || 'Sem nome',
  }));
  const allowed = roleAtLeast(role, 'operator') && tenant.status === 'active';

  return (
    <>
      <Link
        href={`/t/${slug}/documentos`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Documentos
      </Link>
      <PageHeader
        title="Novo documento"
        description="O documento entra como rascunho. Depois de revisado e aprovado pela Qualidade, a IA passa a usá-lo."
      />
      {allowed ? (
        <Card>
          <CreateDocumentForm slug={slug} owners={owners} />
        </Card>
      ) : (
        <Alert tone="info">Só operadores e acima enviam documentos.</Alert>
      )}
    </>
  );
}
