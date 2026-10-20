import type { Channel, OutboundMessage, Recipient } from "../types";

export interface Sender {
  send(channel: Channel, to: Recipient, msg: OutboundMessage): Promise<{ externalId?: string }>;
  replyToComment(channel: Channel, commentId: string, text: string): Promise<void>;
}

const version = () => process.env.META_GRAPH_VERSION ?? "v21.0";

async function post(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line
  if (!res.ok) throw new Error(json?.error?.message ?? `Meta respondeu HTTP ${res.status}`);
  return json;
}

/** Corpo de mensagem no formato Messenger/Instagram. */
export function messengerMessage(msg: OutboundMessage) {
  const buttons = msg.buttons ?? [];
  if (buttons.length === 0) return { text: msg.text };
  if (buttons.length <= 3) {
    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: msg.text,
          buttons: buttons.map((b) => ({ type: "postback", title: b.title, payload: b.payload })),
        },
      },
    };
  }
  return {
    text: msg.text,
    quick_replies: buttons.map((b) => ({ content_type: "text", title: b.title, payload: b.payload })),
  };
}

/** Corpo de mensagem no formato WhatsApp Cloud API. */
export function whatsappMessage(to: string, msg: OutboundMessage) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  const buttons = msg.buttons ?? [];
  if (buttons.length === 0) return { ...base, type: "text", text: { body: msg.text } };
  if (buttons.length <= 3) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: msg.text },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.payload, title: b.title } })) },
      },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: msg.text },
      action: {
        button: "Opções",
        sections: [{ title: "Opções", rows: buttons.map((b) => ({ id: b.payload, title: b.title })) }],
      },
    },
  };
}

export const graphSender: Sender = {
  async send(channel, to, msg) {
    if (channel.type === "whatsapp") {
      if (!("userId" in to)) throw new Error("WhatsApp não suporta resposta a comentário");
      const json = await post(
        `https://graph.facebook.com/${version()}/${channel.external_id}/messages`,
        channel.access_token,
        whatsappMessage(to.userId, msg),
      );
      return { externalId: json?.messages?.[0]?.id };
    }
    const recipient = "userId" in to ? { id: to.userId } : { comment_id: to.commentId };
    const url =
      channel.type === "instagram"
        ? `https://graph.instagram.com/${version()}/${channel.external_id}/messages`
        : `https://graph.facebook.com/${version()}/me/messages`;
    const json = await post(url, channel.access_token, {
      recipient,
      messaging_type: "RESPONSE",
      message: messengerMessage(msg),
    });
    return { externalId: json?.message_id };
  },

  async replyToComment(channel, commentId, text) {
    if (channel.type === "instagram") {
      await post(`https://graph.instagram.com/${version()}/${commentId}/replies`, channel.access_token, { message: text });
    } else if (channel.type === "messenger") {
      await post(`https://graph.facebook.com/${version()}/${commentId}/comments`, channel.access_token, { message: text });
    }
  },
};
