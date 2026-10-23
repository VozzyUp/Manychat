'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { verifySecondFactor } from '../actions';

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verifySecondFactor, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <TextField
        id="code"
        label="Código do aplicativo autenticador"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Verificando…">
        Verificar
      </SubmitButton>
    </form>
  );
}
