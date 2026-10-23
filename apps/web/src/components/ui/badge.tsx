import type { ReactNode } from 'react';
import { cn } from './cn';

const tones = {
  neutral: 'bg-surface-strong text-text',
  accent: 'bg-accent text-on-accent',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
