import type { ReactNode } from 'react';
import { cn } from './cn';

const tones = {
  error: 'border-danger/30 bg-danger-surface text-danger',
  success: 'border-success/30 bg-success-surface text-success',
  warning: 'border-warning/30 bg-warning-surface text-warning',
  info: 'border-border bg-surface text-text',
} as const;

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', tones[tone])}
    >
      {children}
    </div>
  );
}

/** Result of a form action, shown under the form. */
export type FormState =
  | { ok?: boolean; message?: string; fieldErrors?: Record<string, string> }
  | undefined;

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>;
}
