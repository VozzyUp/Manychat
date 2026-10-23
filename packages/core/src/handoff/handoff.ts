import type { TenantDb } from '@nurion/db';

export type HandoffReason =
  | 'no_knowledge'
  | 'no_citation'
  | 'user_request'
  | 'urgency'
  | 'ai_error'
  | 'max_turns'
  | 'unidentified'
  | 'manual'
  | 'other';

/**
 * Opens a handoff for the conversation unless one is already open (one open per conversation).
 * The Chatwoot side (§4.7) is attached in build step 1.10. Returns the open handoff id.
 */
export async function openHandoff(
  tdb: TenantDb,
  input: {
    conversationId: string;
    reason: HandoffReason;
    summary?: string;
    openedBy?: 'ai' | 'user' | 'system';
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await tdb
    .from('handoffs')
    .select('id')
    .eq('conversation_id', input.conversationId)
    .eq('status', 'open')
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { id: existing.data.id, created: false };

  const inserted = await tdb
    .from('handoffs')
    .insert({
      tenant_id: tdb.tenantId,
      conversation_id: input.conversationId,
      reason: input.reason,
      summary: input.summary ?? null,
      opened_by: input.openedBy ?? 'ai',
    })
    .select('id')
    .single();
  if (inserted.error?.code === '23505') {
    // Another worker opened it at the same time.
    return openHandoff(tdb, input);
  }
  if (inserted.error) throw new Error(inserted.error.message);
  return { id: inserted.data.id, created: true };
}

export async function hasOpenHandoff(tdb: TenantDb, conversationId: string): Promise<boolean> {
  const { data, error } = await tdb
    .from('handoffs')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
