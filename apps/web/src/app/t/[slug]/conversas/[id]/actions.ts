'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { getTenantContext } from '@/lib/tenant-context';

/** Closes the open human handoff: the AI answers this conversation again. */
export async function closeHandoff(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = z.string().min(1).parse(formData.get('slug'));
  const conversationId = z.uuid().parse(formData.get('conversation_id'));
  const { tenant } = await getTenantContext(slug);
  const result = await api(`/v1/conversations/${conversationId}/handoff/close`, {
    method: 'POST',
    tenantId: tenant.id,
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(`/t/${slug}/conversas/${conversationId}`);
  revalidatePath(`/t/${slug}/conversas`);
  // The handoff card disappears once closed: the confirmation is shown by the page.
  redirect(`/t/${slug}/conversas/${conversationId}?encerrado=1`);
}
