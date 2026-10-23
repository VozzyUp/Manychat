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

/** The API reads the text fields first, then the file: keep this order. */
function uploadForm(formData: FormData, fields: string[]) {
  const form = new FormData();
  for (const key of fields) {
    const value = formText(formData, key).trim();
    if (value) form.append(key, value);
  }
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) form.append('file', file, file.name);
  return { form, hasFile: file instanceof File && file.size > 0 };
}

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const { form, hasFile } = uploadForm(formData, [
    'title',
    'collection',
    'code',
    'owner_user_id',
    'tags',
    'effective_date',
    'review_date',
  ]);
  if (!hasFile) return { message: 'Escolha o arquivo do documento.' };
  const result = await api<{ id: string }>('/v1/documents', { method: 'POST', tenantId, form });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos`);
  redirect(`/t/${slug}/documentos/${result.data.id}`);
}

export async function addVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('document_id'));
  const { form, hasFile } = uploadForm(formData, ['effective_date', 'review_date']);
  if (!hasFile) return { message: 'Escolha o arquivo da nova versão.' };
  const result = await api(`/v1/documents/${id}/versions`, { method: 'POST', tenantId, form });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos/${id}`);
  return { ok: true, message: 'Nova versão criada como rascunho.' };
}

export async function updateDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('document_id'));
  const tags = formText(formData, 'tags')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const result = await api(`/v1/documents/${id}`, {
    method: 'PATCH',
    tenantId,
    body: {
      title: formText(formData, 'title').trim(),
      collection: formText(formData, 'collection'),
      code: formText(formData, 'code').trim() || null,
      owner_user_id: formText(formData, 'owner_user_id') || null,
      tags,
    },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos`);
  revalidatePath(`/t/${slug}/documentos/${id}`);
  return { ok: true, message: 'Dados do documento salvos.' };
}

export async function updateVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('version_id'));
  const documentId = z.uuid().parse(formData.get('document_id'));
  const result = await api(`/v1/document-versions/${id}`, {
    method: 'PATCH',
    tenantId,
    body: {
      effective_date: formText(formData, 'effective_date') || null,
      review_date: formText(formData, 'review_date') || null,
    },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos/${documentId}`);
  return { ok: true, message: 'Datas salvas.' };
}

export async function transitionVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('version_id'));
  const documentId = z.uuid().parse(formData.get('document_id'));
  const to = z.enum(['em_revisao', 'rascunho', 'aprovado', 'obsoleto']).parse(formData.get('to'));
  const result = await api(`/v1/document-versions/${id}/transition`, {
    method: 'POST',
    tenantId,
    body: { to },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos`);
  revalidatePath(`/t/${slug}/documentos/${documentId}`);
  const done = {
    em_revisao: 'Enviado para revisão.',
    rascunho: 'Devolvido para rascunho.',
    aprovado: 'Aprovado. O documento está sendo processado para a IA.',
    obsoleto: 'Versão marcada como obsoleta.',
  } as const;
  return { ok: true, message: done[to] };
}

export async function reingestVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('version_id'));
  const documentId = z.uuid().parse(formData.get('document_id'));
  const result = await api(`/v1/document-versions/${id}/reingest`, { method: 'POST', tenantId });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos/${documentId}`);
  return { ok: true, message: 'Reprocessamento iniciado.' };
}
