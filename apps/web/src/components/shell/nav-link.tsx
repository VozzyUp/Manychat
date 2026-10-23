'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

/** Sidebar link; `exact` for the tenant home so it is not active on every sub-page. */
export function NavLink({
  href,
  exact,
  children,
}: {
  href: string;
  exact?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        active ? 'bg-surface-strong text-accent-text' : 'text-text hover:bg-surface-strong',
      )}
    >
      {children}
    </Link>
  );
}
