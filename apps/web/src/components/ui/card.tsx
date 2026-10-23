import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** `flush` drops the padding, for lists whose rows run edge to edge. */
export function Card({
  className,
  flush,
  ...props
}: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-bg shadow-card',
        flush ? 'overflow-hidden' : 'p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-4 space-y-1">
      <h2 className="text-base font-semibold text-text">{children}</h2>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  );
}
