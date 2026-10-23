import type { Json, TenantDb } from '@nurion/db';
import {
  GraphApiError,
  withinServiceWindow,
  type Button,
  type ListSection,
  type TemplateMessage,
} from '@nurion/whatsapp';
import { z } from 'zod';
import { PermanentJobError, whatsappClientFor, type ChannelContext } from './context';

/** What can be sent. Everything except templates needs the 24 h service window (§4.2). */
export type OutboundContent =
  | { kind: 'text'; text: string; replyTo?: string }
  | { kind: 'template'; template: TemplateMessage; preview?: string }
  | { kind: 'buttons'; text: string; buttons: Button[]; footer?: string }
  | { kind: 'list'; text: string; buttonLabel: string; sections: ListSection[] }
  | { kind: 'location_request'; text: string };

export type OutboundJob = { tenantId: string; messageId: string };
export type EnqueueOutbound = (job: OutboundJob) => Promise<void>;

const MESSAGE_TYPE: Record<OutboundContent['kind'], 'text' | 'template' | 'interactive'> = {
  text: 'text',
  template: 'template',
  buttons: 'interactive',
  list: 'interactive',
  location_request: 'interactive',
};

/** Stores an outbound message as `queued` and hands it to the `outbound-messages` queue. */
export async function queueOutboundMessage(
  tdb: TenantDb,
  enqueue: EnqueueOutbound,
  input: { conversationId: string; author: 'ai' | 'human' | 'system'; content: OutboundContent },
): Promise<string> {
  const text =
    input.content.kind === 'template'
      ? (input.content.preview ?? `[template ${input.content.template.name}]`)
      : input.content.text;
  const { data, error } = await tdb
    .from('messages')
    .insert({
      tenant_id: tdb.tenantId,
      conversation_id: input.conversationId,
      direction: 'out',
      author: input.author,
      type: MESSAGE_TYPE[input.content.kind],
      text,
      payload: { outbound: input.content } as unknown as { [key: string]: Json },
      status: 'queued',
    })
    .select('id')
    .single();
  if (error) throw new Error(`queue outbound: ${error.message}`);
  await enqueue({ tenantId: tdb.tenantId, messageId: data.id });
  return data.id;
}

const storedContent = z.object({
  outbound: z.custom<OutboundContent>((v) => typeof v === 'object' && v !== null && 'kind' in v),
});

export type OutboundResult =
  | { status: 'sent'; wamid: string }
  | { status: 'skipped' }
  | { status: 'failed'; reason: string };

/**
 * Sends one queued message (job of `outbound-messages`). Idempotent: a message that already left is
 * skipped. Free text outside the 24 h window fails without calling Meta. Retryable Graph errors
 * (rate limits, 5xx, network) are rethrown for the queue's backoff; the last attempt marks the message failed.
 */
export async function processOutbound(
  ctx: ChannelContext,
  job: OutboundJob,
  options: { isLastAttempt: boolean },
): Promise<OutboundResult> {
  const tdb = ctx.db.withTenant(job.tenantId);
  const now = ctx.now?.() ?? new Date();

  const { data: message, error } = await tdb
    .from('messages')
    .select('id, conversation_id, status, payload, direction')
    .eq('id', job.messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message || message.direction !== 'out')
    throw new PermanentJobError('outbound message not found');
  if (message.status !== 'queued') return { status: 'skipped' };

  const parsed = storedContent.safeParse(message.payload);
  if (!parsed.success)
    return markFailed(tdb, job.messageId, { code: 'invalid_payload' }, 'invalid payload');
  const content = parsed.data.outbound;

  const { data: conversation, error: convError } = await tdb
    .from('conversations')
    .select(
      'id, last_inbound_at, contact:contacts(wa_id, metadata, anonymized_at), number:whatsapp_numbers(phone_number_id, access_token_enc, status)',
    )
    .eq('id', message.conversation_id)
    .single();
  if (convError) throw new Error(convError.message);
  const contact = conversation.contact;
  const number = conversation.number;
  if (!contact || contact.anonymized_at)
    return markFailed(tdb, job.messageId, { code: 'contact_unavailable' }, 'contact unavailable');
  if (!number || number.status !== 'active')
    return markFailed(tdb, job.messageId, { code: 'number_disabled' }, 'number disabled');

  if (content.kind !== 'template' && !withinServiceWindow(conversation.last_inbound_at, now)) {
    return markFailed(
      tdb,
      job.messageId,
      { code: 'outside_window' },
      'outside the 24 h window: use a template',
    );
  }

  const client = whatsappClientFor(ctx, number);
  // Reply to the id exactly as WhatsApp sent it (Brazilian 9th digit), else the canonical one.
  const seen = (contact.metadata as { wa_id_seen?: unknown } | null)?.wa_id_seen;
  const to = typeof seen === 'string' && seen ? seen : contact.wa_id;
  let wamid: string;
  try {
    ({ wamid } = await send(client, to, content));
  } catch (err) {
    if (err instanceof GraphApiError && (!err.retryable || options.isLastAttempt)) {
      await markFailed(
        tdb,
        job.messageId,
        { code: err.kind, graph_code: err.code ?? null, message: err.message },
        err.message,
      );
      if (!err.retryable)
        throw new PermanentJobError(`whatsapp ${err.kind}: ${err.message}`, { cause: err });
    }
    throw err;
  }

  const update = await tdb
    .from('messages')
    .update({ wamid, status: 'sent', sent_at: now.toISOString() })
    .eq('id', job.messageId)
    .eq('status', 'queued');
  if (update.error) throw new Error(update.error.message);
  await tdb
    .from('conversations')
    .update({ last_message_at: now.toISOString() })
    .eq('id', conversation.id);
  ctx.logger.info(
    { tenant_id: job.tenantId, conversation_id: conversation.id, kind: content.kind },
    'outbound message sent',
  );
  return { status: 'sent', wamid };
}

function send(client: ReturnType<typeof whatsappClientFor>, to: string, content: OutboundContent) {
  switch (content.kind) {
    case 'text':
      return client.sendText(to, content.text, { replyTo: content.replyTo });
    case 'template':
      return client.sendTemplate(to, content.template);
    case 'buttons':
      return client.sendButtons(to, content.text, content.buttons, { footer: content.footer });
    case 'list':
      return client.sendList(to, content.text, content.buttonLabel, content.sections);
    case 'location_request':
      return client.sendLocationRequest(to, content.text);
  }
}

async function markFailed(
  tdb: TenantDb,
  messageId: string,
  error: { [key: string]: Json | undefined },
  reason: string,
): Promise<OutboundResult> {
  await tdb
    .from('messages')
    .update({ status: 'failed', error })
    .eq('id', messageId)
    .eq('status', 'queued');
  return { status: 'failed', reason };
}
