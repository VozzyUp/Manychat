import { randomBytes, randomInt } from 'node:crypto';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger, createSecretBox } from '@nurion/shared';
import { envelope, inbound } from '@nurion/whatsapp/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PermanentJobError,
  processInboundWebhook,
  processOutbound,
  queueOutboundMessage,
  RetryLaterError,
  type ChannelContext,
} from '../src/channel';
import { createFakeGraph } from './fake-graph';
import { TranscriptionError } from '../src/multimodal/transcribe';

const stack = await findLocalStack('core channel');
const describeStack = stack ? describe : describe.skip;

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describeStack('WhatsApp channel against the local stack', () => {
  const s = stack as LocalStack;
  const graph = createFakeGraph();
  const secrets = createSecretBox({ key: randomBytes(32).toString('base64') });
  let ctx: ChannelContext;
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let phoneNumberId: string;
  const from = `5511${digits(9)}`;
  const inboundEvents: string[] = [];

  /** A webhook body for our test number (fixtures use a fixed phone number id). */
  const forOurNumber = (body: ReturnType<typeof envelope>) => {
    const value = body.entry[0]!.changes[0]!.value as {
      metadata: { phone_number_id: string };
      contacts?: { wa_id: string }[];
      messages?: { from: string }[];
    };
    value.metadata.phone_number_id = phoneNumberId;
    for (const c of value.contacts ?? []) c.wa_id = from;
    for (const m of value.messages ?? []) m.from = from;
    return body;
  };
  const wamid = () => `wamid.${digits(20)}`;
  const run = (body: unknown, attempt = 1) =>
    processInboundWebhook(ctx, body, {
      attempt,
      onInbound: async (e) => {
        inboundEvents.push(e.messageId);
      },
    });

  beforeAll(async () => {
    tenant = await createTestTenant(s, ['log']);
    phoneNumberId = digits(15);
    await runSql(
      s,
      `insert into whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_number, access_token_enc)
       values ($1, $2, '102290129340398', '+55 11 4002-8922', $3)`,
      [tenant.tenantId, phoneNumberId, secrets.encrypt('EAAG-test-token')],
    );
    ctx = {
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      secrets,
      graph: { version: 'v23.0', fetch: graph.fetch },
      logger: createLogger('core-test', { level: 'silent' }),
    };
  });

  afterAll(async () => {
    await runSql(s, `select 1`); // keep pg happy on fast teardown
    await tenant?.drop();
  });

  it('stores a text message once, creating the contact and the conversation', async () => {
    const id = wamid();
    const body = forOurNumber(inbound({ type: 'text', text: { body: 'iniciar' } }, id));
    expect(await run(body)).toMatchObject({ stored: 1, duplicates: 0 });
    expect(await run(body)).toMatchObject({ stored: 0, duplicates: 1 });

    const rows = await runSql<{
      text: string;
      kind: string;
      profile_name: string;
      last_inbound_at: Date;
    }>(
      s,
      `select m.text, c.kind, c.profile_name, cv.last_inbound_at
         from messages m join conversations cv on cv.id = m.conversation_id join contacts c on c.id = cv.contact_id
        where m.wamid = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      text: 'iniciar',
      kind: 'unknown',
      profile_name: 'João Motorista',
    });
    expect(rows[0]!.last_inbound_at).toBeInstanceOf(Date);
    expect(inboundEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores messages for numbers that are not registered', async () => {
    const body = inbound({ type: 'text', text: { body: 'oi' } }, wamid());
    (
      body.entry[0]!.changes[0]!.value as { metadata: { phone_number_id: string } }
    ).metadata.phone_number_id = digits(15);
    expect(await run(body)).toMatchObject({ stored: 0, unknownNumber: 1 });
  });

  it('downloads media to <tenant>/<yyyy>/<mm>/<wamid>.<ext> and retries when the download fails', async () => {
    const mediaId = digits(16);
    graph.state.media.set(mediaId, { mime: 'image/jpeg', bytes: PNG });
    const id = wamid();
    const body = forOurNumber(
      inbound(
        {
          type: 'image',
          image: { id: mediaId, mime_type: 'image/jpeg', sha256: 'x', caption: 'termômetro' },
        },
        id,
      ),
    );

    graph.state.mediaFails = true;
    await expect(run(body)).rejects.toThrow(/media download failed/);
    const [failed] = await runSql<{ status: string }>(
      s,
      `select mm.status from message_media mm join messages m on m.id = mm.message_id where m.wamid = $1`,
      [id],
    );
    expect(failed?.status).toBe('failed');

    graph.state.mediaFails = false;
    expect(await run(body, 2)).toMatchObject({ duplicates: 1 });
    const [media] = await runSql<{
      status: string;
      storage_path: string;
      size: string;
      mime: string;
    }>(
      s,
      `select mm.status, mm.storage_path, mm.size, mm.mime from message_media mm join messages m on m.id = mm.message_id where m.wamid = $1`,
      [id],
    );
    expect(media).toMatchObject({ status: 'stored', mime: 'image/jpeg', size: String(PNG.length) });
    expect(media!.storage_path).toMatch(
      new RegExp(`^${tenant.tenantId}/\\d{4}/\\d{2}/wamid\\.\\d+\\.jpg$`),
    );

    const download = await ctx.db
      .withTenant(tenant.tenantId)
      .storage.from('media')
      .download(media!.storage_path);
    expect(Buffer.from(await download.data!.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('a voice note is transcribed before the turn is scheduled, and a retry after an outage still transcribes it', async () => {
    const mediaId = digits(16);
    graph.state.media.set(mediaId, {
      mime: 'audio/ogg; codecs=opus',
      bytes: Buffer.from([1, 2, 3, 4]),
    });
    const id = wamid();
    const body = forOurNumber(
      inbound(
        {
          type: 'audio',
          audio: { id: mediaId, mime_type: 'audio/ogg; codecs=opus', sha256: 'x', voice: true },
        },
        id,
      ),
    );
    let outage = true;
    const withAudio: ChannelContext = {
      ...ctx,
      transcriber: {
        model: 'whisper-test',
        async transcribe() {
          if (outage) throw new TranscriptionError('provider returned 503', true);
          return { text: 'Cheguei no cliente.', durationSeconds: 2, language: 'pt' };
        },
      },
    };
    const seen: (string | null)[] = [];
    const onInbound = async (e: { messageId: string }) => {
      const [m] = await runSql<{ transcription: string | null }>(
        s,
        `select transcription from messages where id = $1`,
        [e.messageId],
      );
      seen.push(m!.transcription);
    };

    // Outage on attempt 1: the job fails (and will retry); the turn was not scheduled yet.
    await expect(
      processInboundWebhook(withAudio, body, { attempt: 1, isLastAttempt: false, onInbound }),
    ).rejects.toThrow('503');
    expect(seen).toEqual([]);

    outage = false;
    await processInboundWebhook(withAudio, body, { attempt: 2, isLastAttempt: false, onInbound });
    expect(seen).toEqual(['Cheguei no cliente.']);
  });

  async function conversationId() {
    const [row] = await runSql<{ id: string }>(
      s,
      `select cv.id from conversations cv join contacts c on c.id = cv.contact_id where cv.tenant_id = $1 and c.wa_id = $2`,
      [tenant.tenantId, from],
    );
    return row!.id;
  }

  it('sends text inside the 24 h window, then applies delivery statuses without going backwards', async () => {
    const jobs: string[] = [];
    const tdb = ctx.db.withTenant(tenant.tenantId);
    const messageId = await queueOutboundMessage(
      tdb,
      async (job) => void jobs.push(job.messageId),
      {
        conversationId: await conversationId(),
        author: 'ai',
        content: { kind: 'text', text: 'Entrega ativa: ENT-001' },
      },
    );
    expect(jobs).toEqual([messageId]);

    const result = await processOutbound(
      ctx,
      { tenantId: tenant.tenantId, messageId },
      { isLastAttempt: false },
    );
    expect(result.status).toBe('sent');
    expect(graph.sends().at(-1)!.body).toMatchObject({
      to: from,
      type: 'text',
      text: { body: 'Entrega ativa: ENT-001' },
    });
    const sentWamid = (result as { wamid: string }).wamid;

    // Same job again: nothing is sent twice.
    expect(
      await processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId },
        { isLastAttempt: false },
      ),
    ).toEqual({ status: 'skipped' });

    const status = (value: string, ts: number, extra: Record<string, unknown> = {}) =>
      forOurNumber(
        envelope({
          statuses: [
            { id: sentWamid, status: value, timestamp: String(ts), recipient_id: from, ...extra },
          ],
        }),
      );
    await run(status('read', 1792720002));
    await run(
      status('delivered', 1792720001, { pricing: { category: 'service', billable: true } }),
    );
    const [row] = await runSql<{ status: string; payload: { pricing?: { category: string } } }>(
      s,
      `select status, payload from messages where id = $1`,
      [messageId],
    );
    expect(row!.status).toBe('read');
    expect(row!.payload.pricing?.category).toBe('service');
  });

  it('retries statuses that arrive before the message is known, then lets go', async () => {
    const body = forOurNumber(
      envelope({
        statuses: [
          { id: 'wamid.unknown', status: 'sent', timestamp: '1792720000', recipient_id: from },
        ],
      }),
    );
    await expect(run(body, 1)).rejects.toBeInstanceOf(RetryLaterError);
    expect(await run(body, 3)).toMatchObject({ statusesMissing: 1 });
  });

  it('refuses free text outside the 24 h window without calling Meta; templates still go', async () => {
    const conv = await conversationId();
    await runSql(
      s,
      `update conversations set last_inbound_at = now() - interval '25 hours' where id = $1`,
      [conv],
    );
    const tdb = ctx.db.withTenant(tenant.tenantId);
    const before = graph.sends().length;

    const textId = await queueOutboundMessage(tdb, async () => {}, {
      conversationId: conv,
      author: 'system',
      content: { kind: 'text', text: 'oi' },
    });
    expect(
      await processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId: textId },
        { isLastAttempt: false },
      ),
    ).toMatchObject({ status: 'failed' });
    expect(graph.sends().length).toBe(before);
    const [failed] = await runSql<{ status: string; error: { code: string } }>(
      s,
      `select status, error from messages where id = $1`,
      [textId],
    );
    expect(failed).toMatchObject({ status: 'failed', error: { code: 'outside_window' } });

    const templateId = await queueOutboundMessage(tdb, async () => {}, {
      conversationId: conv,
      author: 'system',
      content: {
        kind: 'template',
        template: { name: 'rota_do_dia', language: 'pt_BR', bodyParams: ['ENT-002'] },
      },
    });
    expect(
      await processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId: templateId },
        { isLastAttempt: false },
      ),
    ).toMatchObject({ status: 'sent' });
    expect(graph.sends().at(-1)!.body).toMatchObject({
      type: 'template',
      template: { name: 'rota_do_dia' },
    });
    await runSql(s, `update conversations set last_inbound_at = now() where id = $1`, [conv]);
  });

  it('stops on permanent Graph errors and keeps retrying transient ones until the last attempt', async () => {
    const tdb = ctx.db.withTenant(tenant.tenantId);
    const conv = await conversationId();

    graph.state.sendError = { status: 400, code: 131026, message: 'Message undeliverable' };
    const permanent = await queueOutboundMessage(tdb, async () => {}, {
      conversationId: conv,
      author: 'ai',
      content: { kind: 'text', text: 'x' },
    });
    await expect(
      processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId: permanent },
        { isLastAttempt: false },
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);

    graph.state.sendError = { status: 429, code: 130429, message: 'Rate limit hit' };
    const transient = await queueOutboundMessage(tdb, async () => {}, {
      conversationId: conv,
      author: 'ai',
      content: { kind: 'text', text: 'y' },
    });
    await expect(
      processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId: transient },
        { isLastAttempt: false },
      ),
    ).rejects.toMatchObject({ retryable: true });
    let [row] = await runSql<{ status: string }>(s, `select status from messages where id = $1`, [
      transient,
    ]);
    expect(row!.status).toBe('queued');
    await expect(
      processOutbound(
        ctx,
        { tenantId: tenant.tenantId, messageId: transient },
        { isLastAttempt: true },
      ),
    ).rejects.toMatchObject({ retryable: true });
    [row] = await runSql<{ status: string }>(s, `select status from messages where id = $1`, [
      transient,
    ]);
    expect(row!.status).toBe('failed');
    graph.state.sendError = null;
  });
});
