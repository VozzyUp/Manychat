import { z } from "zod";

export const channelTypes = ["instagram", "messenger", "whatsapp"] as const;
export type ChannelType = (typeof channelTypes)[number];

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  external_id: string;
  access_token: string;
  active: boolean;
}

export interface Contact {
  id: string;
  channel_id: string;
  external_id: string;
  name: string | null;
  tags: string[];
  fields: Record<string, string>;
  last_inbound_at: string | null;
  created_at?: string;
}

const id = z.string().min(1);
const next = id.optional();

export const stepSchema = z.discriminatedUnion("type", [
  z.object({ id, next, type: z.literal("text"), text: z.string().min(1) }),
  z.object({
    id,
    type: z.literal("buttons"),
    text: z.string().min(1),
    buttons: z
      .array(z.object({ title: z.string().min(1).max(20), next: id }))
      .min(1)
      .max(10),
  }),
  z.object({ id, next, type: z.literal("delay"), seconds: z.number().int().positive() }),
  z.object({ id, next, type: z.literal("wait_reply"), save_to: z.string().min(1) }),
  z.object({ id, next, type: z.literal("add_tag"), tag: z.string().min(1) }),
  z.object({ id, next, type: z.literal("remove_tag"), tag: z.string().min(1) }),
  z.object({ id, next, type: z.literal("set_field"), key: z.string().min(1), value: z.string() }),
  z.object({ id, type: z.literal("condition"), tag: z.string().min(1), then: id, else: id }),
  z.object({ id, type: z.literal("goto"), step: id }),
  z.object({ id, type: z.literal("end") }),
]);
export type Step = z.infer<typeof stepSchema>;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("keyword"),
    keywords: z.array(z.string().min(1)).min(1),
    match: z.enum(["exact", "contains"]),
  }),
  z.object({
    type: z.literal("comment"),
    // vazio = qualquer comentário
    keywords: z.array(z.string().min(1)),
    // vazio = qualquer post
    post_ids: z.array(z.string().min(1)),
    public_reply: z.string().optional(),
  }),
  z.object({ type: z.literal("welcome") }),
  z.object({ type: z.literal("default") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const flowSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    active: z.boolean(),
    priority: z.number().int(),
    channel_types: z.array(z.enum(channelTypes)),
    trigger: triggerSchema,
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((flow, ctx) => {
    const ids = new Set<string>();
    for (const s of flow.steps) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `ID de passo repetido: ${s.id}` });
      ids.add(s.id);
    }
    const refs: string[] = [];
    for (const s of flow.steps) {
      if ("next" in s && s.next) refs.push(s.next);
      if (s.type === "buttons") refs.push(...s.buttons.map((b) => b.next));
      if (s.type === "condition") refs.push(s.then, s.else);
      if (s.type === "goto") refs.push(s.step);
    }
    for (const r of refs) {
      if (!ids.has(r)) ctx.addIssue({ code: "custom", message: `Passo inexistente: ${r}` });
    }
  });
export type Flow = z.infer<typeof flowSchema>;

export type RunStatus = "active" | "waiting_delay" | "waiting_input" | "done" | "failed" | "cancelled";

export interface FlowRun {
  id: string;
  flow_id: string;
  contact_id: string;
  status: RunStatus;
  step_id: string | null;
  resume_at: string | null;
}

/** Evento recebido da Meta, já normalizado para os três canais. */
export interface InboundEvent {
  channelType: ChannelType;
  /** Conta que recebeu: ID IG, ID da página ou phone_number_id. */
  accountId: string;
  senderId: string;
  senderName?: string;
  kind: "message" | "postback" | "comment";
  /** ID da Meta para deduplicar. */
  eventId: string;
  text?: string;
  payload?: string;
  commentId?: string;
  postId?: string;
  timestamp: string;
}

export interface MessageRecord {
  contact_id: string;
  direction: "in" | "out";
  kind: string;
  text?: string | null;
  payload?: string | null;
  external_id?: string | null;
  status?: "ok" | "failed";
  error?: string | null;
}

export interface OutboundMessage {
  text: string;
  buttons?: { title: string; payload: string }[];
}

export type Recipient = { userId: string } | { commentId: string };
