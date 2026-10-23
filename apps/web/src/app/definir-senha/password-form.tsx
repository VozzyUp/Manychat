'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { setPassword } from '../login/actions';

export function PasswordForm() {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <TextField
        id="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 10 caracteres, com letras e números."
        minLength={10}
        required
      />
      <TextField
        id="confirm"
        label="Repita a senha"
        type="password"
        autoComplete="new-password"
        required
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar senha</SubmitButton>
    </form>
  );
}
