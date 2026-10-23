import { describe, expect, it } from 'vitest';
import { classifyGraphError, GraphApiError, WhatsAppClient } from './client';
import { extensionFor, withinServiceWindow } from './window';

type Call = { url: string; method: string; body: unknown; auth: string | null };

function fakeGraph(
  respond: (call: Call) => { status?: number; json: unknown } = () => ({
    json: { messages: [{ id: 'wamid.sent' }] },
  }),
) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: new Headers(init.headers).get('authorization'),
    };
    calls.push(call);
    const { status = 200, json } = respond(call);
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new WhatsAppClient({
    phoneNumberId: '123',
    accessToken: 'tok',
    graphVersion: 'v23.0',
    fetch: fetch,
  });
  return { client, calls };
}

describe('WhatsAppClient', () => {
  it('sends text in the Cloud API format and returns the wamid', async () => {
    const { client, calls } = fakeGraph();
    await expect(client.sendText('5511987654321', 'Olá', { replyTo: 'wamid.in' })).resolves.toEqual(
      {
        wamid: 'wamid.sent',
      },
    );
    expect(calls[0]).toMatchObject({
      url: 'https://graph.facebook.com/v23.0/123/messages',
      method: 'POST',
      auth: 'Bearer tok',
      body: {
        messaging_product: 'whatsapp',
        to: '5511987654321',
        type: 'text',
        text: { body: 'Olá', preview_url: false },
        context: { message_id: 'wamid.in' },
      },
    });
  });

  it('sends templates with body parameters', async () => {
    const { client, calls } = fakeGraph();
    await client.sendTemplate('5511987654321', {
      name: 'alerta_temperatura',
      language: 'pt_BR',
      bodyParams: ['João', '9,1 °C'],
    });
    expect(calls[0]!.body).toMatchObject({
      type: 'template',
      template: {
        name: 'alerta_temperatura',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'João' },
              { type: 'text', text: '9,1 °C' },
            ],
          },
        ],
      },
    });
  });

  it('sends reply buttons, lists and location requests', async () => {
    const { client, calls } = fakeGraph();
    await client.sendButtons('55', 'Aceita?', [
      { id: 'yes', title: 'Aceito' },
      { id: 'no', title: 'Não aceito, obrigado pela mensagem' },
    ]);
    expect(
      (calls[0]!.body as { interactive: { action: { buttons: { reply: { title: string } }[] } } })
        .interactive.action.buttons[1]!.reply.title,
    ).toHaveLength(20);
    expect(() => client.sendButtons('55', 'x', [])).toThrow();
    await client.sendList('55', 'Escolha', 'Unidades', [{ rows: [{ id: 'u1', title: 'Centro' }] }]);
    await client.sendLocationRequest('55', 'Envie sua localização');
    expect(calls[2]!.body).toMatchObject({ interactive: { type: 'location_request_message' } });
  });

  it('classifies Graph errors so queues know when to retry', async () => {
    const { client } = fakeGraph(() => ({
      status: 400,
      json: {
        error: {
          code: 131047,
          message: 'Re-engagement message',
          error_data: { details: 'more than 24 hours' },
        },
      },
    }));
    const error = await client.sendText('55', 'oi').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphApiError);
    expect(error).toMatchObject({ kind: 'outside_window', retryable: false, code: 131047 });

    expect(classifyGraphError(401, 190)).toEqual({ kind: 'invalid_token', retryable: false });
    expect(classifyGraphError(429, 130429)).toEqual({ kind: 'rate_limited', retryable: true });
    expect(classifyGraphError(400, 131026)).toEqual({ kind: 'recipient', retryable: false });
    expect(classifyGraphError(400, 132001)).toEqual({ kind: 'template', retryable: false });
    expect(classifyGraphError(503)).toEqual({ kind: 'server', retryable: true });
  });

  it('treats network failures as retryable', async () => {
    const client = new WhatsAppClient({
      phoneNumberId: '1',
      accessToken: 't',
      fetch: () => Promise.reject(new Error('ECONNRESET')),
    });
    await expect(client.sendText('55', 'x')).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
    });
  });

  it('fetches media metadata and downloads with the token', async () => {
    const { client, calls } = fakeGraph((call) =>
      call.url.endsWith('/987')
        ? {
            json: {
              url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=987',
              mime_type: 'image/jpeg',
              file_size: 3,
            },
          }
        : { json: {} },
    );
    const media = await client.getMedia('987');
    expect(media).toMatchObject({ mimeType: 'image/jpeg', fileSize: 3 });
    expect(calls[0]!.auth).toBe('Bearer tok');
  });
});

describe('service window and file extensions', () => {
  it('allows free text only within 24 h of the last inbound message', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(withinServiceWindow(new Date('2026-10-22T12:00:01Z'), now)).toBe(true);
    expect(withinServiceWindow(new Date('2026-10-22T11:59:59Z'), now)).toBe(false);
    expect(withinServiceWindow(null, now)).toBe(false);
  });

  it('maps MIME types to storage extensions', () => {
    expect(extensionFor('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensionFor('application/pdf', 'Pedido Médico.PDF')).toBe('pdf');
    expect(extensionFor('application/x-unknown')).toBe('bin');
  });
});
