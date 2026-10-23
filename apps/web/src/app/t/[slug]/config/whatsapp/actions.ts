'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { formText } from '@/lib/form';
import { getTenantContext } from '@/lib/tenant-context';

async function tenantFrom(formData: FormData) {
  const slug = z.string().min(1).parse(formData.get('slug'));
  const { tenant } = await getTenantContext(slug);
  return { slug, tenantId: tenant.id };
}
const optional = (formData: FormData, key: string) => formText(formData, key).trim() || undefined;

export async function addNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api('/v1/whatsapp-numbers', {
    method: 'POST',
    tenantId,
    body: {
      phone_number_id: formText(formData, 'phone_number_id').trim(),
      waba_id: formText(formData, 'waba_id').trim(),
      access_token: formText(formData, 'access_token').trim(),
      default_module: optional(formData, 'default_module') ?? null,
    },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/whatsapp`);
  return { ok: true, message: 'Número conectado e token validado com a Meta.' };
}

export async function updateNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('number_id'));
  const intent = formText(formData, 'intent');
  const body =
    intent === 'toggle'
      ? { status: formText(formData, 'status') === 'active' ? 'disabled' : 'active' }
      : intent === 'token'
        ? { access_token: formText(formData, 'access_token').trim() }
        : { default_module: optional(formData, 'default_module') ?? null };
  const path =
    intent === 'check' ? `/v1/whatsapp-numbers/${id}/check` : `/v1/whatsapp-numbers/${id}`;
  const result = await api(path, {
    method: intent === 'check' ? 'POST' : 'PATCH',
    tenantId,
    body: intent === 'check' ? undefined : body,
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/whatsapp`);
  const done: Record<string, string> = {
    toggle: 'Situação atualizada.',
    token: 'Token trocado e validado.',
    check: 'Conexão com a Meta confirmada.',
  };
  return { ok: true, message: done[intent] ?? 'Módulo padrão atualizado.' };
}

export async function deleteNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('number_id'));
  const result = await api(`/v1/whatsapp-numbers/${id}`, { method: 'DELETE', tenantId });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/whatsapp`);
  return { ok: true, message: 'Número excluído.' };
}
