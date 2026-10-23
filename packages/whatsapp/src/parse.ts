import { z } from 'zod';
import type { InboundMessage, MessageType, ParsedWebhook, StatusUpdate } from './types';

const media = z.object({
  id: z.string(),
  mime_type: z.string().default('application/octet-stream'),
  sha256: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  voice: z.boolean().optional(),
});

const message = z.looseObject({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  context: z.looseObject({ id: z.string().optional() }).optional(),
  text: z.object({ body: z.string() }).optional(),
  image: media.optional(),
  audio: media.optional(),
  video: media.optional(),
  document: media.optional(),
  sticker: media.optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  interactive: z
    .looseObject({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().optional(), text: z.string() }).optional(),
  reaction: z.object({ message_id: z.string(), emoji: z.string().optional() }).optional(),
});

const status = z.looseObject({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string(),
  pricing: z
    .looseObject({ category: z.string().optional(), billable: z.boolean().optional() })
    .optional(),
  errors: z
    .array(
      z.looseObject({
        code: z.number(),
        title: z.string().optional(),
        message: z.string().optional(),
        error_data: z.looseObject({ details: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

const webhook = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.looseObject({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).partial().optional(),
                }),
              )
              .optional(),
            messages: z.array(z.unknown()).optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        }),
      ),
    }),
  ),
});

const DIRECT_TYPES = new Set<MessageType>([
  'text',
  'audio',
  'image',
  'document',
  'video',
  'sticker',
  'location',
  'interactive',
  'button',
  'reaction',
  'contacts',
]);
const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

const toDate = (seconds: string) => new Date(Number(seconds) * 1000);

/**
 * Turns a Cloud API webhook body into normalized messages and delivery statuses.
 * Unknown message types become `unsupported` (kept, never dropped); malformed items are skipped
 * individually so one bad item does not lose the rest of the batch.
 */
export function parseWebhook(body: unknown): ParsedWebhook {
  const parsed = webhook.safeParse(body);
  if (!parsed.success) return { messages: [], statuses: [] };

  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const names = new Map(value.contacts?.map((c) => [c.wa_id, c.profile?.name]) ?? []);

      for (const item of value.messages ?? []) {
        const m = message.safeParse(item);
        if (!m.success) continue;
        messages.push(
          normalizeMessage(m.data, { phoneNumberId, wabaId: entry.id, names, raw: item }),
        );
      }
      for (const item of value.statuses ?? []) {
        const s = status.safeParse(item);
        if (!s.success || !STATUSES.has(s.data.status)) continue;
        statuses.push({
          phoneNumberId,
          wamid: s.data.id,
          status: s.data.status as StatusUpdate['status'],
          timestamp: toDate(s.data.timestamp),
          recipientWaId: s.data.recipient_id,
          pricing: s.data.pricing
            ? { category: s.data.pricing.category, billable: s.data.pricing.billable }
            : undefined,
          errors: s.data.errors?.map((e) => ({
            code: e.code,
            title: e.title,
            message: e.message,
            details: e.error_data?.details,
          })),
          raw: item,
        });
      }
    }
  }
  return { messages, statuses };
}

function normalizeMessage(
  m: z.infer<typeof message>,
  ctx: {
    phoneNumberId: string;
    wabaId: string;
    names: Map<string, string | undefined>;
    raw: unknown;
  },
): InboundMessage {
  const type: MessageType = DIRECT_TYPES.has(m.type as MessageType)
    ? (m.type as MessageType)
    : 'unsupported';
  const base: InboundMessage = {
    phoneNumberId: ctx.phoneNumberId,
    wabaId: ctx.wabaId,
    waId: m.from,
    profileName: ctx.names.get(m.from),
    wamid: m.id,
    timestamp: toDate(m.timestamp),
    type,
    contextWamid: m.context?.id,
    raw: ctx.raw,
  };

  const file = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker;
  if (
    (type === 'image' ||
      type === 'audio' ||
      type === 'video' ||
      type === 'document' ||
      type === 'sticker') &&
    file
  ) {
    base.media = {
      id: file.id,
      mimeType: file.mime_type,
      sha256: file.sha256,
      filename: file.filename,
      voice: file.voice,
    };
    base.text = file.caption;
  }
  if (type === 'text') base.text = m.text?.body;
  if (type === 'location' && m.location) {
    base.location = m.location;
    base.text = [m.location.name, m.location.address].filter(Boolean).join(' — ') || undefined;
  }
  if (type === 'interactive' && m.interactive) {
    const reply = m.interactive.button_reply ?? m.interactive.list_reply;
    if (reply) {
      base.reply = {
        kind: m.interactive.button_reply ? 'button_reply' : 'list_reply',
        id: reply.id,
        title: reply.title,
      };
      base.text = reply.title;
    }
  }
  if (type === 'button' && m.button) {
    base.reply = {
      kind: 'template_button',
      id: m.button.payload ?? m.button.text,
      title: m.button.text,
    };
    base.text = m.button.text;
  }
  if (type === 'reaction' && m.reaction) {
    base.reaction = { wamid: m.reaction.message_id, emoji: m.reaction.emoji };
    base.text = m.reaction.emoji;
  }
  return base;
}
