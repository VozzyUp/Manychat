import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/lib/labels';
import { requireUser } from '@/lib/session';
import { getMemberships } from '@/lib/tenant-context';
import { AuthCard } from '../login/auth-card';

export const metadata: Metadata = { title: 'Escolha a empresa · Nurion Hub' };

/** S02 — pick a tenant (skipped when the user has only one). */
export default async function TenantsPage() {
  const user = await requireUser('/tenants');
  const memberships = await getMemberships();
  if (memberships.length === 1) redirect(`/t/${memberships[0]!.tenant.slug}`);

  return (
    <AuthCard
      title={memberships.length ? 'Escolha a empresa' : 'Nenhuma empresa ainda'}
      subtitle={
        memberships.length
          ? user.email
          : 'Seu acesso ainda não foi liberado em nenhuma empresa. Peça um convite ao responsável.'
      }
    >
      {memberships.length ? (
        <ul className="space-y-2">
          {memberships.map(({ tenant, role }) => (
            <li key={tenant.id}>
              <Link
                href={`/t/${tenant.slug}`}
                className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-surface"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold"
                  style={{ background: tenant.branding.accent, color: tenant.branding.onAccent }}
                >
                  {tenant.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">{tenant.name}</span>
                  <span className="block text-sm text-muted">{ROLE_LABELS[role]}</span>
                </span>
                {tenant.status !== 'active' ? <Badge tone="warning">Suspensa</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={signOut}>
        <button type="submit" className="w-full text-center text-sm text-muted hover:underline">
          Sair
        </button>
      </form>
    </AuthCard>
  );
}
