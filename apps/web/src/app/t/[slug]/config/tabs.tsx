'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

export function ConfigTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: 'Geral e marca' },
    { href: `${base}/membros`, label: 'Equipe' },
    { href: `${base}/modulos`, label: 'Módulos e setores' },
    { href: `${base}/whatsapp`, label: 'WhatsApp' },
    { href: `${base}/templates`, label: 'Templates' },
  ];
  return (
    <nav
      aria-label="Seções de configuração"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              active
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-text',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
