import type { ReactNode } from 'react';

/** Centered card used by every signed-out screen. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-bg p-6 shadow-card sm:p-8">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-accent-text">Nurion Hub</p>
          <h1 className="text-xl font-bold text-text">{title}</h1>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}
