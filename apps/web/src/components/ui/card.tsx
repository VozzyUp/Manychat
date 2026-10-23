import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-bg p-5 shadow-card', className)}
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
