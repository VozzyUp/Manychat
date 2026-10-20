import type { ChannelType, InboundEvent } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const iso = (ms: number | string | undefined) => {
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!n || Number.isNaN(n)) return new Date().toISOString();
  // WhatsApp manda segundos; Messenger/IG mandam milissegundos.
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
};

/** Converte o corpo do webhook da Meta numa lista de eventos normalizados. */
export function parseWebhook(body: Json): InboundEvent[] {
  const events: InboundEvent[] = [];
  const object = body?.object;
  for (const entry of body?.entry ?? []) {
    if (object === "instagram" || object === "page") {
      const channelType: ChannelType = object === "instagram" ? "instagram" : "messenger";
      for (const m of entry.messaging ?? []) parseMessaging(events, channelType, entry.id, m);
      for (const change of entry.changes ?? []) parseComment(events, channelType, entry.id, change);
    } else if (object === "whatsapp_business_account") {
      for (const change of entry.changes ?? []) parseWhatsApp(events, change);
    }
  }
  return events;
}

function parseMessaging(out: InboundEvent[], channelType: ChannelType, accountId: string, m: Json) {
  const senderId = m.sender?.id;
  if (!senderId || senderId === accountId) return;
  const base = { channelType, accountId: String(accountId), senderId: String(senderId), timestamp: iso(m.timestamp) };
  if (m.message) {
    if (m.message.is_echo || m.message.is_deleted) return;
    const qr = m.message.quick_reply?.payload;
    out.push({
      ...base,
      kind: qr ? "postback" : "message",
      eventId: m.message.mid,
      text: m.message.text,
      payload: qr,
    });
  } else if (m.postback) {
    out.push({
      ...base,
      kind: "postback",
      eventId: m.postback.mid ?? `pb:${senderId}:${m.timestamp}:${m.postback.payload}`,
      text: m.postback.title,
      payload: m.postback.payload,
    });
  }
}

function parseComment(out: InboundEvent[], channelType: ChannelType, accountId: string, change: Json) {
  const v = change.value ?? {};
  if (channelType === "instagram" && change.field === "comments") {
    const from = v.from?.id;
    if (!from || from === accountId || !v.id) return;
    out.push({
      channelType,
      accountId: String(accountId),
      senderId: String(from),
      senderName: v.from?.username,
      kind: "comment",
      eventId: `c:${v.id}`,
      text: v.text,
      commentId: v.id,
      postId: v.media?.id,
      timestamp: new Date().toISOString(),
    });
  }
  if (channelType === "messenger" && change.field === "feed" && v.item === "comment" && v.verb === "add") {
    const from = v.from?.id;
    if (!from || from === accountId || !v.comment_id) return;
    out.push({
      channelType,
      accountId: String(accountId),
      senderId: String(from),
      senderName: v.from?.name,
      kind: "comment",
      eventId: `c:${v.comment_id}`,
      text: v.message,
      commentId: v.comment_id,
      postId: v.post_id,
      timestamp: iso(v.created_time),
    });
  }
}

function parseWhatsApp(out: InboundEvent[], change: Json) {
  if (change.field !== "messages") return;
  const v = change.value ?? {};
  const accountId = v.metadata?.phone_number_id;
  if (!accountId) return;
  const names = new Map<string, string>();
  for (const c of v.contacts ?? []) if (c.wa_id) names.set(c.wa_id, c.profile?.name);
  for (const msg of v.messages ?? []) {
    const base = {
      channelType: "whatsapp" as const,
      accountId: String(accountId),
      senderId: String(msg.from),
      senderName: names.get(msg.from),
      eventId: msg.id,
      timestamp: iso(msg.timestamp),
    };
    if (msg.type === "text") {
      out.push({ ...base, kind: "message", text: msg.text?.body });
    } else if (msg.type === "interactive") {
      const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      if (r) out.push({ ...base, kind: "postback", text: r.title, payload: r.id });
    } else if (msg.type === "button") {
      // Botão de template
      out.push({ ...base, kind: "postback", text: msg.button?.text, payload: msg.button?.payload });
    } else {
      // Áudio, imagem etc.: conta como mensagem sem texto
      out.push({ ...base, kind: "message", text: undefined });
    }
  }
}
