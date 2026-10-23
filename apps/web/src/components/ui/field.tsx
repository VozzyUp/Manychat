import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const control =
  'block w-full rounded-md border border-border-input bg-bg px-3 text-sm text-text placeholder:text-muted disabled:bg-surface';

type FieldShellProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
};

/** Label + control + hint/error, wired with aria-describedby. */
export function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Common = { id: string; label: string; hint?: ReactNode; error?: string };

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={props.name ?? id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(control, 'h-10', className)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        name={props.name ?? id}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'h-10', className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={props.name ?? id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(control, 'min-h-24 py-2', className)}
        {...props}
      />
    </FieldShell>
  );
}
