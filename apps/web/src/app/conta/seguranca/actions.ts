'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ui/alert';
import { formText } from '@/lib/form';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type Enrollment = { factorId: string; qrCode: string; secret: string };

/** Starts TOTP enrollment (clears abandoned, unverified factors first). */
export async function startEnrollment(): Promise<Enrollment | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: 'Não foi possível iniciar a ativação. Tente de novo.' };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const confirmInput = z.object({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) });

export async function confirmEnrollment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = confirmInput.safeParse({
    factorId: formText(formData, 'factor_id'),
    code: formText(formData, 'code').replace(/\s/g, ''),
  });
  if (!parsed.success) return { message: 'Digite os 6 números do aplicativo.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error)
    return { message: 'Código inválido. Confira o horário do celular e tente o código atual.' };
  revalidatePath('/conta/seguranca');
  return { ok: true, message: 'Verificação em duas etapas ativada.' };
}

export async function disableTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const factorId = z.uuid().safeParse(formText(formData, 'factor_id'));
  if (!factorId.success) return { message: 'Fator inválido.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factorId.data });
  if (error)
    return { message: 'Não foi possível desativar. Entre de novo com o código e tente outra vez.' };
  revalidatePath('/conta/seguranca');
  return { ok: true, message: 'Verificação em duas etapas desativada.' };
}
