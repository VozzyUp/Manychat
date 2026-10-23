import type { TenantMembership } from '@nurion/db/queries';
import { Contact, Home, LogOut, Menu, MessagesSquare, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/actions/auth';
import { brandingStyle } from '@/lib/branding';
import { ROLE_LABELS } from '@/lib/labels';
import { NavLink } from './nav-link';
import { TenantSwitcher } from './tenant-switcher';

type Props = {
  membership: TenantMembership;
  memberships: TenantMembership[];
  userEmail: string | null;
  children: ReactNode;
};

/** Tenant shell (white-label): brand header, tenant switcher, navigation of the enabled modules. */
export function AppShell({ membership, memberships, userEmail, children }: Props) {
  const { tenant, role } = membership;
  const base = `/t/${tenant.slug}`;
  const nav = (
    <nav aria-label="Navegação principal" className="space-y-1">
      <NavLink href={base} exact>
        <Home aria-hidden size={16} /> Início
      </NavLink>
      <NavLink href={`${base}/conversas`}>
        <MessagesSquare aria-hidden size={16} /> Conversas
      </NavLink>
      <NavLink href={`${base}/contatos`}>
        <Contact aria-hidden size={16} /> Contatos
      </NavLink>
      <NavLink href={`${base}/config`}>
        <Settings aria-hidden size={16} /> Configurações
      </NavLink>
    </nav>
  );

  return (
    <div style={brandingStyle(tenant.branding)} className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-bg px-4">
        <details className="relative lg:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-surface-strong">
            <Menu aria-hidden size={20} />
            <span className="sr-only">Abrir menu</span>
          </summary>
          <div className="absolute left-0 top-11 w-64 rounded-lg border border-border bg-bg p-3 shadow-card">
            {nav}
          </div>
        </details>
        <Link href={base} className="flex min-w-0 items-center gap-2">
          {tenant.branding.logoUrl ? (
            // Tenant logos come from Supabase Storage (public bucket); next/image would need a remote pattern per project.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.branding.logoUrl}
              alt=""
              className="h-8 w-auto max-w-32 object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent"
            >
              {tenant.branding.productName.slice(0, 1)}
            </span>
          )}
          <span className="truncate font-semibold text-text">{tenant.branding.productName}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <TenantSwitcher
            current={tenant.slug}
            options={memberships.map((m) => ({ slug: m.tenant.slug, name: m.tenant.name }))}
          />
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md px-2 text-sm hover:bg-surface-strong">
              <span className="max-w-40 truncate">{userEmail ?? 'Conta'}</span>
            </summary>
            <div className="absolute right-0 top-11 w-64 space-y-2 rounded-lg border border-border bg-bg p-3 text-sm shadow-card">
              <p className="text-muted">
                {tenant.name} · {ROLE_LABELS[role]}
              </p>
              <Link
                href={`/conta/seguranca?next=${encodeURIComponent(base)}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-strong"
              >
                <ShieldCheck aria-hidden size={16} /> Segurança da conta
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-strong"
                >
                  <LogOut aria-hidden size={16} /> Sair
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-62 shrink-0 border-r border-border bg-bg p-3 lg:block">
          {nav}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
