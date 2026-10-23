import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

const variants = {
  primary: 'bg-accent text-on-accent hover:brightness-90',
  secondary: 'border border-border bg-bg text-text hover:bg-surface',
  ghost: 'text-text hover:bg-surface-strong',
  danger: 'bg-danger text-white hover:brightness-90',
} as const;

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function buttonClass(
  variant: keyof typeof variants = 'primary',
  size: keyof typeof sizes = 'md',
) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonClass(variant, size), className)}
      {...props}
    />
  );
}
