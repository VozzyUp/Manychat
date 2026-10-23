import { describe, expect, it } from 'vitest';
import * as f from './fixtures/webhooks';
import { parseWebhook } from './parse';

const one = (body: unknown) => {
  const { messages } = parseWebhook(body);
  expect(messages).toHaveLength(1);
  return messages[0]!;
};

describe('parseWebhook', () => {
  it('normalizes a text message with tenant routing data', () => {
    expect(one(f.textMessage)).toMatchObject({
      phoneNumberId: f.PHONE_NUMBER_ID,
      wabaId: f.WABA_ID,
      waId: f.FROM,
      profileName: 'João Motorista',
      type: 'text',
      text: 'iniciar',
      timestamp: new Date(1792710000 * 1000),
    });
  });

  it('keeps media references (audio, image with caption, document with file name)', () => {
    expect(one(f.audioMessage)).toMatchObject({
      type: 'audio',
      media: { id: '1046795343722183', mimeType: 'audio/ogg; codecs=opus', voice: true },
    });
    expect(one(f.imageMessage)).toMatchObject({ type: 'image', text: 'termômetro da coleta' });
    expect(one(f.documentMessage)).toMatchObject({
      type: 'document',
      media: { filename: 'pedido.pdf', mimeType: 'application/pdf' },
    });
  });

  it('reads locations, button and list replies, and template quick replies', () => {
    expect(one(f.locationMessage)).toMatchObject({
      type: 'location',
      location: { latitude: -23.5613, longitude: -46.6565 },
      text: 'CD Sul — Av. Paulista, 1000',
    });
    expect(one(f.buttonReply)).toMatchObject({
      type: 'interactive',
      reply: { kind: 'button_reply', id: 'consent_yes', title: 'Aceito' },
      contextWamid: 'wamid.previous',
    });
    expect(one(f.listReply)).toMatchObject({ reply: { kind: 'list_reply', id: 'unit_2' } });
    expect(one(f.templateButton)).toMatchObject({
      type: 'button',
      reply: { kind: 'template_button', id: 'confirmar_rota', title: 'Confirmar' },
    });
  });

  it('keeps unknown message types as unsupported instead of dropping them', () => {
    expect(one(f.unknownType)).toMatchObject({ type: 'unsupported' });
  });

  it('reads delivery statuses with pricing and errors', () => {
    expect(parseWebhook(f.statusDelivered).statuses[0]).toMatchObject({
      wamid: 'wamid.out1',
      status: 'delivered',
      pricing: { category: 'service', billable: true },
    });
    expect(parseWebhook(f.statusFailed).statuses[0]).toMatchObject({
      status: 'failed',
      errors: [{ code: 131047, details: expect.stringContaining('24 hours') }],
    });
  });

  it('skips malformed items without losing the rest of the batch', () => {
    const body = f.envelope({
      contacts: f.contacts,
      messages: [
        { id: 'broken' },
        {
          from: f.FROM,
          id: 'wamid.ok',
          timestamp: '1792710000',
          type: 'text',
          text: { body: 'ok' },
        },
      ],
    });
    expect(parseWebhook(body).messages.map((m) => m.wamid)).toEqual(['wamid.ok']);
  });

  it('ignores other objects and fields', () => {
    expect(parseWebhook({ object: 'page', entry: [] })).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    const other = f.envelope({});
    other.entry[0]!.changes[0]!.field = 'account_update';
    expect(parseWebhook(other)).toEqual({ messages: [], statuses: [] });
  });
});
