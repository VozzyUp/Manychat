import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requireUser } from '@/lib/session';
import { getTenantContext } from '@/lib/tenant-context';

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/t/${slug}`);
  const context = await getTenantContext(slug);
  return (
    <AppShell membership={context} memberships={context.memberships} userEmail={user.email}>
      {context.tenant.status !== 'active' ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-warning-surface px-3 py-2 text-sm text-warning"
        >
          Esta empresa está suspensa. As alterações estão bloqueadas; fale com o suporte.
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
