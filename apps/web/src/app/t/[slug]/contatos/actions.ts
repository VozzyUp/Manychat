'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

export async function createContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api<{ id: string }>('/v1/contacts', {
    method: 'POST',
    tenantId,
    body: {
      phone: formText(formData, 'phone').trim(),
      name: formText(formData, 'name').trim() || undefined,
      kind: formText(formData, 'kind') || 'unknown',
    },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/contatos`);
  redirect(`/t/${slug}/contatos/${result.data.id}`);
}

export async function updateContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('contact_id'));
  const result = await api(`/v1/contacts/${id}`, {
    method: 'PATCH',
    tenantId,
    body: { name: formText(formData, 'name').trim() || null, kind: formText(formData, 'kind') },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/contatos/${id}`);
  revalidatePath(`/t/${slug}/contatos`);
  return { ok: true, message: 'Contato atualizado.' };
}

export async function anonymizeContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('contact_id'));
  if (formData.get('confirm') !== 'yes') {
    return { message: 'Marque a confirmação para anonimizar.' };
  }
  const result = await api<{ removed_files: number }>(`/v1/contacts/${id}/anonymize`, {
    method: 'POST',
    tenantId,
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/contatos/${id}`);
  revalidatePath(`/t/${slug}/contatos`);
  revalidatePath(`/t/${slug}/conversas`);
  // The anonymize card disappears afterwards: the confirmation is shown by the page.
  redirect(`/t/${slug}/contatos/${id}?anonimizado=${result.data.removed_files}`);
}
