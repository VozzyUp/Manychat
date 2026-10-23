import type { Json } from '@nurion/db';
import { canonicalWaId } from '@nurion/shared';
import { parseWebhook, type InboundMessage } from '@nurion/whatsapp';
import { RetryLaterError, type ChannelContext } from './context';
import { enrichInboundMedia } from '../multimodal/enrich';
import { storeInboundMedia } from './media';

/** Called for every stored inbound message (the router schedules the agent turn from here). */
export type OnInboundMessage = (event: {
  tenantId: string;
  conversationId: string;
  messageId: string;
}) => Promise<void>;

export type InboundSummary = {
  stored: number;
  duplicates: number;
  unknownNumber: number;
  statusesApplied: number;
  statusesMissing: number;
};

/** Delivery statuses can arrive before our own write of the wamid: retry a few times, then let go. */
export const STATUS_RETRY_ATTEMPTS = 3;

type NumberRow = NonNullable<
  Awaited<ReturnType<ChannelContext['db']['system']['findWhatsappNumber']>>
>;

/**
 * Processes one webhook body from the `inbound-messages` queue (ESCOPO §4.2, §4.3 step 1):
 * resolves the tenant by phone_number_id, stores each message once (wamid), downloads media to
 * Storage and applies delivery statuses. Safe to run more than once for the same body.
 */
export async function processInboundWebhook(
  ctx: ChannelContext,
  body: unknown,
  options: { attempt: number; isLastAttempt?: boolean; onInbound?: OnInboundMessage },
): Promise<InboundSummary> {
  const parsed = parseWebhook(body);
  const summary: InboundSummary = {
    stored: 0,
    duplicates: 0,
    unknownNumber: 0,
    statusesApplied: 0,
    statusesMissing: 0,
  };
  const numbers = new Map<string, NumberRow | null>();

  const resolve = async (phoneNumberId: string) => {
    if (!numbers.has(phoneNumberId)) {
      const row = await ctx.db.system.findWhatsappNumber(phoneNumberId);
      numbers.set(phoneNumberId, row && row.status === 'active' ? row : null);
    }
    return numbers.get(phoneNumberId) ?? null;
  };

  for (const message of parsed.messages) {
    const number = await resolve(message.phoneNumberId);
    if (!number) {
      summary.unknownNumber += 1;
      ctx.logger.warn(
        { phone_number_id: message.phoneNumberId },
        'inbound for unknown or disabled number',
      );
      continue;
    }
    const tdb = ctx.db.withTenant(number.tenant_id);
    const { data, error } = await tdb.rpc('record_inbound_message', {
      p_tenant_id: number.tenant_id,
      p_whatsapp_number_id: number.id,
      p_wa_id: canonicalWaId(message.waId),
      p_wa_id_seen: message.waId,
      p_wamid: message.wamid,
      p_type: message.type,
      p_payload: payloadOf(message),
      p_raw: message.raw as Json,
      p_sent_at: message.timestamp.toISOString(),
      p_profile_name: message.profileName,
      p_text: message.text,
      p_media: message.media
        ? {
            id: message.media.id,
            mime: message.media.mimeType,
            sha256: message.media.sha256 ?? null,
            filename: message.media.filename ?? null,
          }
        : undefined,
    });
    if (error) throw new Error(`record_inbound_message: ${error.message}`);
    const row = data[0];
    if (!row) throw new Error('record_inbound_message returned nothing');
    if (row.inserted) summary.stored += 1;
    else summary.duplicates += 1;

    const log = ctx.logger.child({
      tenant_id: number.tenant_id,
      conversation_id: row.conversation_id,
    });
    if (row.media_row_id && message.media) {
      const stored = await storeInboundMedia(ctx, tdb, {
        mediaRowId: row.media_row_id,
        mediaId: message.media.id,
        wamid: message.wamid,
        sentAt: message.timestamp,
        number,
        filename: message.media.filename,
      });
      log.info({ size: stored.size, mime: stored.mime }, 'inbound media stored');
    }
    // Audio → text, PDF → text. Also on repeated deliveries: it only does what is still missing.
    if (message.media) {
      await enrichInboundMedia(ctx, tdb, {
        messageId: row.message_id,
        isLastAttempt: options.isLastAttempt ?? false,
      });
    }
    log.info({ type: message.type, duplicate: !row.inserted }, 'inbound message recorded');
    await options.onInbound?.({
      tenantId: number.tenant_id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
    });
  }

  for (const status of parsed.statuses) {
    const number = await resolve(status.phoneNumberId);
    if (!number) continue;
    const { data, error } = await ctx.db.withTenant(number.tenant_id).rpc('apply_message_status', {
      p_tenant_id: number.tenant_id,
      p_wamid: status.wamid,
      p_status: status.status,
      p_at: status.timestamp.toISOString(),
      p_errors: status.errors as Json | undefined,
      p_pricing: status.pricing as Json | undefined,
    });
    if (error) throw new Error(`apply_message_status: ${error.message}`);
    if (data) summary.statusesApplied += 1;
    else summary.statusesMissing += 1;
  }

  if (summary.statusesMissing > 0 && options.attempt < STATUS_RETRY_ATTEMPTS) {
    throw new RetryLaterError(
      `${summary.statusesMissing} status(es) for unknown messages; retrying`,
    );
  }
  return summary;
}

function payloadOf(message: InboundMessage): Json {
  return {
    ...(message.location ? { location: message.location } : {}),
    ...(message.reply ? { reply: message.reply } : {}),
    ...(message.reaction ? { reaction: message.reaction } : {}),
    ...(message.contextWamid ? { context_wamid: message.contextWamid } : {}),
    ...(message.media ? { media: { voice: message.media.voice ?? false } } : {}),
  };
}
