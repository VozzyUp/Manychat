/** Webhook bodies in the shape the Cloud API sends them (values are fictitious). */
export const PHONE_NUMBER_ID = '106540352242922';
export const WABA_ID = '102290129340398';
export const FROM = '5511987654321';

export function envelope(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '551140028922', phone_number_id: PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

export const contacts = [{ profile: { name: 'João Motorista' }, wa_id: FROM }];

export function inbound(
  message: Record<string, unknown>,
  id = 'wamid.HBgNNTUxMTk4NzY1NDMyMRUCABIYFDNBMDE=',
) {
  return envelope({
    contacts,
    messages: [{ from: FROM, id, timestamp: '1792710000', ...message }],
  });
}

export const textMessage = inbound({ type: 'text', text: { body: 'iniciar' } });
export const audioMessage = inbound({
  type: 'audio',
  audio: {
    id: '1046795343722183',
    mime_type: 'audio/ogg; codecs=opus',
    sha256: 'abc',
    voice: true,
  },
});
export const imageMessage = inbound({
  type: 'image',
  image: {
    id: '1279000000000001',
    mime_type: 'image/jpeg',
    sha256: 'def',
    caption: 'termômetro da coleta',
  },
});
export const documentMessage = inbound({
  type: 'document',
  document: {
    id: '1279000000000002',
    mime_type: 'application/pdf',
    sha256: 'ghi',
    filename: 'pedido.pdf',
  },
});
export const locationMessage = inbound({
  type: 'location',
  location: {
    latitude: -23.5613,
    longitude: -46.6565,
    name: 'CD Sul',
    address: 'Av. Paulista, 1000',
  },
});
export const buttonReply = inbound({
  type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id: 'consent_yes', title: 'Aceito' } },
  context: { from: '551140028922', id: 'wamid.previous' },
});
export const listReply = inbound({
  type: 'interactive',
  interactive: {
    type: 'list_reply',
    list_reply: { id: 'unit_2', title: 'Unidade Centro', description: 'x' },
  },
});
export const templateButton = inbound({
  type: 'button',
  button: { payload: 'confirmar_rota', text: 'Confirmar' },
});
export const unknownType = inbound({ type: 'order', order: { catalog_id: '1' } });

export const statusDelivered = envelope({
  statuses: [
    {
      id: 'wamid.out1',
      status: 'delivered',
      timestamp: '1792710100',
      recipient_id: FROM,
      conversation: { id: 'c1', origin: { type: 'service' } },
      pricing: { billable: true, pricing_model: 'PMP', category: 'service' },
    },
  ],
});
export const statusFailed = envelope({
  statuses: [
    {
      id: 'wamid.out2',
      status: 'failed',
      timestamp: '1792710200',
      recipient_id: FROM,
      errors: [
        {
          code: 131047,
          title: 'Re-engagement message',
          message: 'Re-engagement message',
          error_data: { details: 'Message failed to send because more than 24 hours have passed' },
        },
      ],
    },
  ],
});
