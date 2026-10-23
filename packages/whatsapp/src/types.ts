/** Message types we store (matches messages.type in the database). */
export type MessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'sticker'
  | 'location'
  | 'interactive'
  | 'button'
  | 'template'
  | 'reaction'
  | 'contacts'
  | 'unsupported';

export type InboundMedia = {
  id: string;
  mimeType: string;
  sha256?: string;
  filename?: string;
  /** Audio recorded in WhatsApp (push-to-talk) rather than an attached file. */
  voice?: boolean;
};

export type InboundMessage = {
  phoneNumberId: string;
  wabaId: string;
  /** Sender's WhatsApp id (digits, with country code). */
  waId: string;
  profileName?: string;
  wamid: string;
  timestamp: Date;
  type: MessageType;
  /** Text body, media caption, button/list title or location name — whatever a human would read. */
  text?: string;
  media?: InboundMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  /** Reply to an interactive message (button or list) or a template quick-reply button. */
  reply?: { kind: 'button_reply' | 'list_reply' | 'template_button'; id: string; title: string };
  reaction?: { wamid: string; emoji?: string };
  /** The message this one replies to (WhatsApp "reply" feature). */
  contextWamid?: string;
  raw: unknown;
};

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type StatusUpdate = {
  phoneNumberId: string;
  wamid: string;
  status: DeliveryStatus;
  timestamp: Date;
  recipientWaId: string;
  pricing?: { category?: string; billable?: boolean };
  errors?: { code: number; title?: string; message?: string; details?: string }[];
  raw: unknown;
};

export type ParsedWebhook = { messages: InboundMessage[]; statuses: StatusUpdate[] };
