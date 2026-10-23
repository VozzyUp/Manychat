'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { signIn } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <TextField id="email" label="E-mail" type="email" autoComplete="email" required />
      <TextField
        id="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/esqueci-senha"
          className="font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
