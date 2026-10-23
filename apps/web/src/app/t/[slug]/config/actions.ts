'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { getTenantContext } from '@/lib/tenant-context';

/** Resolves the tenant from the slug the form posted (membership checked server-side). */
async function tenantFrom(formData: FormData) {
  const slug = z.string().min(1).parse(formData.get('slug'));
  const { tenant } = await getTenantContext(slug);
  return { slug, tenantId: tenant.id };
}

const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

const refresh = (slug: string) => revalidatePath(`/t/${slug}`, 'layout');

export async function updateGeneral(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api('/v1/tenant', {
    method: 'PATCH',
    tenantId,
    body: {
      name: text(formData.get('name')) ?? undefined,
      branding: { name: text(formData.get('brand_name')), primary: text(formData.get('primary')) },
      settings: {
        timezone: text(formData.get('timezone')) ?? undefined,
        business_hours: text(formData.get('business_hours')),
        rules: text(formData.get('rules')),
      },
    },
  });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Configurações salvas.' };
}

export async function uploadLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { message: 'Escolha uma imagem.' };
  const form = new FormData();
  form.set('file', file, file.name);
  const result = await api('/v1/tenant/logo', { method: 'POST', tenantId, form });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Logo atualizado.' };
}

export async function removeLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api('/v1/tenant/logo', { method: 'DELETE', tenantId });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Logo removido.' };
}

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api<{ invited: boolean }>('/v1/members', {
    method: 'POST',
    tenantId,
    body: {
      email: text(formData.get('email')),
      role: text(formData.get('role')),
      full_name: text(formData.get('full_name')) ?? undefined,
    },
  });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return {
    ok: true,
    message: result.data.invited
      ? 'Convite enviado por e-mail.'
      : 'Pessoa adicionada (ela já tinha acesso ao Nurion Hub).',
  };
}

export async function changeMemberRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('member_id'));
  const result = await api(`/v1/members/${id}`, {
    method: 'PATCH',
    tenantId,
    body: { role: text(formData.get('role')) },
  });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Papel atualizado.' };
}

export async function removeMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('member_id'));
  const result = await api(`/v1/members/${id}`, { method: 'DELETE', tenantId });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Acesso removido.' };
}

export async function addDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const result = await api('/v1/departments', {
    method: 'POST',
    tenantId,
    body: { name: text(formData.get('name')) },
  });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Setor criado.' };
}

export async function renameDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('department_id'));
  const result = await api(`/v1/departments/${id}`, {
    method: 'PATCH',
    tenantId,
    body: { name: text(formData.get('name')) },
  });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Setor renomeado.' };
}

export async function deleteDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { slug, tenantId } = await tenantFrom(formData);
  const id = z.uuid().parse(formData.get('department_id'));
  const result = await api(`/v1/departments/${id}`, { method: 'DELETE', tenantId });
  if (!result.ok) return { message: result.message };
  refresh(slug);
  return { ok: true, message: 'Setor excluído.' };
}
