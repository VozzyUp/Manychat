'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { getTenantContext } from '@/lib/tenant-context';

export async function setGapStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = z.string().min(1).parse(formData.get('slug'));
  const id = z.uuid().parse(formData.get('gap_id'));
  const status = z.enum(['open', 'resolved']).parse(formData.get('status'));
  const { tenant } = await getTenantContext(slug);
  const result = await api(`/v1/knowledge-gaps/${id}`, {
    method: 'PATCH',
    tenantId: tenant.id,
    body: { status },
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/documentos/lacunas`);
  revalidatePath(`/t/${slug}/documentos`);
  return { ok: true };
}
