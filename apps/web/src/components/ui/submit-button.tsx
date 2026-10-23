'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './button';

/** Submit button that shows a busy label while its form's action runs. */
export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (pendingLabel ?? 'Salvando…') : children}
    </Button>
  );
}
