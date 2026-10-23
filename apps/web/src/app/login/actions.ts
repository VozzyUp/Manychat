'use server';

import { serverEnv } from '@/lib/env';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formText } from '@/lib/form';
import type { FormState } from '@/components/ui/alert';
import { safeNext } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const credentials = z.object({ email: z.email(), password: z.string().min(1) });

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { message: 'Informe um e-mail válido e a senha.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      message:
        error.code === 'email_not_confirmed'
          ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
          : 'E-mail ou senha incorretos.',
    };
  }

  const next = safeNext(formData.get('next'));
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

const code = z.string().regex(/^\d{6}$/);

export async function verifySecondFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = code.safeParse(formText(formData, 'code').replace(/\s/g, ''));
  if (!parsed.success) return { message: 'Digite os 6 números do aplicativo autenticador.' };

  const supabase = await createSupabaseServerClient();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === 'verified');
  if (error || !factor) redirect('/login');

  const result = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  });
  if (result.error) return { message: 'Código inválido ou expirado. Tente o código atual.' };
  redirect(safeNext(formData.get('next')));
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = z.email().safeParse(formData.get('email'));
  if (!email.success) return { message: 'Informe um e-mail válido.' };
  const supabase = await createSupabaseServerClient();
  // The answer is the same whether the e-mail exists or not (no account enumeration).
  // The e-mail link points at this panel's own address (works on a LAN address too).
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${serverEnv().WEB_URL}/auth/confirm`,
  });
  return {
    ok: true,
    message: 'Se esse e-mail tiver acesso, você vai receber um link para criar uma nova senha.',
  };
}

const newPassword = z
  .object({
    password: z
      .string()
      .min(10, 'A senha precisa de pelo menos 10 caracteres.')
      .regex(/[A-Za-z]/, 'Use letras e números.')
      .regex(/\d/, 'Use letras e números.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  });

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPassword.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Senha inválida.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      message:
        error.code === 'same_password'
          ? 'Escolha uma senha diferente da atual.'
          : 'Não foi possível salvar a senha. Abra o link do e-mail de novo.',
    };
  }
  redirect('/tenants');
}
