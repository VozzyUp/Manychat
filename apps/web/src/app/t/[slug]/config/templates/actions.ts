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

export async function syncTemplates(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api<{ synced: number }>('/v1/whatsapp-templates/sync', {
    method: 'POST',
    tenantId,
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/templates`);
  return { ok: true, message: `${result.data.synced} template(s) sincronizado(s) com a Meta.` };
}

export async function addTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api('/v1/whatsapp-templates', {
    method: 'POST',
    tenantId,
    body: {
      waba_id: formText(formData, 'waba_id'),
      name: formText(formData, 'name').trim(),
      language: formText(formData, 'language') || 'pt_BR',
      category: formText(formData, 'category'),
      body: formText(formData, 'body'),
    },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/templates`);
  return {
    ok: true,
    message: 'Template registrado. Envie para aprovação na Meta e depois sincronize.',
  };
}

export async function deleteTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('template_id'));
  const result = await api(`/v1/whatsapp-templates/${id}`, { method: 'DELETE', tenantId });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/config/templates`);
  return { ok: true, message: 'Template removido do Nurion Hub.' };
}
