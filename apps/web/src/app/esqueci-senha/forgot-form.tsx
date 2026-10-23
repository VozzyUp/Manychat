'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { requestPasswordReset } from '../login/actions';

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <TextField id="email" label="E-mail" type="email" autoComplete="email" required />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Enviando…">
        Enviar link
      </SubmitButton>
    </form>
  );
}
