'use client';

import { useRouter } from 'next/navigation';

type Option = { slug: string; name: string };

/** Switches the active tenant (the tenant lives in the URL: /t/<slug>). */
export function TenantSwitcher({ current, options }: { current: string; options: Option[] }) {
  const router = useRouter();
  if (options.length < 2) return null;
  return (
    <div>
      <label htmlFor="tenant-switcher" className="sr-only">
        Trocar de empresa
      </label>
      <select
        id="tenant-switcher"
        value={current}
        onChange={(event) => router.push(`/t/${event.target.value}`)}
        className="h-9 max-w-56 truncate rounded-md border border-border-input bg-bg px-2 text-sm text-text"
      >
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
