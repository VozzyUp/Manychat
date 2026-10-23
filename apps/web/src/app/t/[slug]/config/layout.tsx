import { roleAtLeast } from '@nurion/shared';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { getTenantContext } from '@/lib/tenant-context';
import { ConfigTabs } from './tabs';

export default async function ConfigLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { role } = await getTenantContext(slug);
  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, marca, equipe e módulos." />
      <ConfigTabs base={`/t/${slug}/config`} />
      {!roleAtLeast(role, 'admin') ? (
        <div className="mb-4">
          <Alert tone="info">
            Só administradores alteram estas configurações. Você pode consultar.
          </Alert>
        </div>
      ) : null}
      {children}
    </>
  );
}
