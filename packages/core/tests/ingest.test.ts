import { randomUUID } from 'node:crypto';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger } from '@nurion/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingsError,
  parsePricing,
  PermanentJobError,
  processIngest,
  type EmbeddingsProvider,
  type IngestContext,
} from '../src';
import { createFakeLlm, message, text } from './fake-llm';

const stack = await findLocalStack('core ingest');
const describeStack = stack ? describe : describe.skip;

const POP = `POP-015 Transporte de amostras

1 Objetivo
Padronizar o transporte de amostras biológicas entre unidades.

2 Temperatura
2.1 Câmara fria
A câmara fria deve ficar entre 2 e 8 graus. Registrar a leitura duas vezes ao dia.
2.2 Transporte
A caixa térmica deve manter 2 a 8 graus durante todo o trajeto.`;

/** A one-page PDF with real text (or none), written by hand: enough for pdf.js. */
function pdf(pageText: string): Uint8Array {
  const stream = pageText ? `BT /F1 12 Tf 50 700 Td (${pageText}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describeStack('document ingestion against the local stack (embeddings and model mocked)', () => {
  const s = stack as LocalStack;
  const tenants: Awaited<ReturnType<typeof createTestTenant>>[] = [];
  const fakeLlm = createFakeLlm();
  let embedCalls: string[][] = [];
  let embedFailure: Error | null = null;
  const embeddings: EmbeddingsProvider = {
    model: 'test-embed',
    async embed(texts) {
      embedCalls.push(texts);
      if (embedFailure) throw embedFailure;
      return {
        vectors: texts.map((t) =>
          Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => ((t.length + i) % 7) / 10),
        ),
        tokens: texts.length * 100,
      };
    },
  };
  let ctx: IngestContext;

  beforeAll(() => {
    ctx = {
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      secrets: undefined as never,
      graph: { version: 'v23.0' },
      logger: createLogger('ingest-test', { level: 'silent' }),
      embeddings,
      llm: {
        client: fakeLlm.llm,
        models: { agent: 'test-model-agent', fast: 'test-model-fast', vision: 'test-model-vision' },
        pricing: parsePricing(
          '{"test-model-fast":{"input":0.1,"output":0.5},"test-embed":{"input":0.02,"output":0}}',
        ),
      },
    };
  });
  afterAll(async () => {
    for (const t of tenants) await t.drop();
  });

  async function setup() {
    const tenant = await createTestTenant(s, ['consult']);
    tenants.push(tenant);
    const [doc] = await runSql<{ id: string }>(
      s,
      `insert into documents (tenant_id, collection, code, title) values ($1, 'pop', 'POP-015', 'Transporte de amostras') returning id`,
      [tenant.tenantId],
    );
    const addVersion = async (
      version: number,
      data: Uint8Array,
      filename = 'pop.txt',
      mime = 'text/plain',
    ) => {
      const path = `${tenant.tenantId}/${doc!.id}/v${version}-${randomUUID()}.bin`;
      const up = await ctx.db
        .withTenant(tenant.tenantId)
        .storage.from('documents')
        .upload(path, Buffer.from(data), { contentType: mime });
      expect(up.error).toBeNull();
      const [v] = await runSql<{ id: string }>(
        s,
        `insert into document_versions (tenant_id, document_id, version, storage_path, filename, mime, size, sha256, status, approved_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'aprovado', now()) returning id`,
        [tenant.tenantId, doc!.id, version, path, filename, mime, data.length, randomUUID()],
      );
      return v!.id;
    };
    return {
      ...tenant,
      docId: doc!.id,
      addVersion,
      job: (versionId: string) => ({ tenantId: tenant.tenantId, versionId }),
    };
  }

  const state = (versionId: string) =>
    runSql<Record<string, unknown>>(
      s,
      `select status, ingest_status, ingest_error, chunk_count, summary, activated_at is not null as active, ingested_at is not null as has_time from document_versions where id = $1`,
      [versionId],
    ).then((r) => r[0]!);

  it('extracts, chunks by section, embeds, summarises and activates', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    embedCalls = [];
    fakeLlm.script(
      message(
        [
          text(
            '{"summary":"Define como transportar amostras entre unidades mantendo 2 a 8 graus."}',
          ),
        ],
        { usage: { input_tokens: 600, output_tokens: 30 } },
      ),
    );

    const result = await processIngest(ctx, t.job(v1), { isLastAttempt: false });
    expect(result).toEqual({ status: 'ready', chunks: 4, activated: true });
    expect(await state(v1)).toMatchObject({
      status: 'aprovado',
      ingest_status: 'ready',
      ingest_error: null,
      chunk_count: 4,
      active: true,
      has_time: true,
      summary: 'Define como transportar amostras entre unidades mantendo 2 a 8 graus.',
    });

    const chunks = await runSql<{
      chunk_index: number;
      section_path: string | null;
      page: number;
      embedding_model: string;
      dims: number;
    }>(
      s,
      `select chunk_index, section_path, page, embedding_model, vector_dims(embedding) as dims from document_chunks where document_version_id = $1 order by chunk_index`,
      [v1],
    );
    expect(chunks.map((c) => c.section_path)).toEqual([
      null,
      '1 Objetivo',
      '2 Temperatura > 2.1 Câmara fria',
      '2 Temperatura > 2.2 Transporte',
    ]);
    expect(
      chunks.every((c) => c.page === 1 && c.embedding_model === 'test-embed' && c.dims === 1536),
    ).toBe(true);
    // The embedding input carries title and section, so a question about "câmara fria" finds it.
    expect(embedCalls[0]![2]).toBe(
      'Transporte de amostras\n2 Temperatura > 2.1 Câmara fria\nA câmara fria deve ficar entre 2 e 8 graus. Registrar a leitura duas vezes ao dia.',
    );

    const [doc] = await runSql<{ current_version_id: string }>(
      s,
      `select current_version_id from documents where id = $1`,
      [t.docId],
    );
    expect(doc!.current_version_id).toBe(v1);
    const runs = await runSql<{
      agent_key: string;
      model: string;
      input_tokens: number;
      cost_usd: string;
    }>(
      s,
      `select agent_key, model, input_tokens, cost_usd::text from ai_runs where tenant_id = $1 order by agent_key`,
      [t.tenantId],
    );
    expect(runs).toEqual([
      {
        agent_key: 'ingest.embeddings',
        model: 'test-embed',
        input_tokens: 400,
        cost_usd: '0.000008',
      },
      {
        agent_key: 'ingest.summary',
        model: 'test-model-fast',
        input_tokens: 600,
        cost_usd: '0.000075',
      },
    ]);

    // The same job again does nothing.
    expect(await processIngest(ctx, t.job(v1), { isLastAttempt: false })).toEqual({
      status: 'skipped',
      reason: 'already ingested',
    });
  });

  it('a new version replaces the old one only when its ingestion is ready', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    fakeLlm.script(message([text('{"summary":"v1"}')]));
    await processIngest(ctx, t.job(v1), { isLastAttempt: false });

    const v2 = await t.addVersion(2, new TextEncoder().encode(POP.replace('2 e 8', '2 e 6')));
    // v2 approved but not ingested: v1 still feeds the AI.
    expect(await state(v1)).toMatchObject({ status: 'aprovado', active: true });
    expect(await state(v2)).toMatchObject({
      status: 'aprovado',
      active: false,
      ingest_status: 'pending',
    });

    fakeLlm.script(message([text('{"summary":"v2"}')]));
    await processIngest(ctx, t.job(v2), { isLastAttempt: false });
    expect(await state(v1)).toMatchObject({ status: 'obsoleto' });
    expect(await state(v2)).toMatchObject({ status: 'aprovado', active: true });
    const [doc] = await runSql<{ current_version_id: string }>(
      s,
      `select current_version_id from documents where id = $1`,
      [t.docId],
    );
    expect(doc!.current_version_id).toBe(v2);
  });

  it('a summary failure never blocks the ingestion', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    fakeLlm.script(message([text('not json')]));
    expect((await processIngest(ctx, t.job(v1), { isLastAttempt: false })).status).toBe('ready');
    expect(await state(v1)).toMatchObject({ ingest_status: 'ready', summary: null });
  });

  it('re-running replaces the chunks instead of duplicating them', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    fakeLlm.script(message([text('{"summary":"x"}')]));
    await processIngest(ctx, t.job(v1), { isLastAttempt: false });
    await runSql(
      s,
      `update document_versions set activated_at = null, ingest_status = 'failed' where id = $1`,
      [v1],
    );
    await processIngest(ctx, t.job(v1), { isLastAttempt: false });
    const [n] = await runSql<{ n: string }>(
      s,
      `select count(*)::text as n from document_chunks where document_version_id = $1`,
      [v1],
    );
    expect(n!.n).toBe('4');
  });

  it('reads a PDF page by page', async () => {
    const t = await setup();
    const v1 = await t.addVersion(
      1,
      pdf('1 Objetivo Padronizar o transporte de amostras biologicas entre as unidades da rede.'),
      'pop.pdf',
      'application/pdf',
    );
    fakeLlm.script(message([text('{"summary":"pdf"}')]));
    expect(await processIngest(ctx, t.job(v1), { isLastAttempt: false })).toMatchObject({
      status: 'ready',
    });
    const [c] = await runSql<{ content: string; page: number }>(
      s,
      `select content, page from document_chunks where document_version_id = $1`,
      [v1],
    );
    expect(c).toMatchObject({ page: 1 });
    expect(c!.content).toContain('Padronizar o transporte');
  });

  it('permanent problems mark the version failed with a readable message and are not retried', async () => {
    const t = await setup();
    const scanned = await t.addVersion(1, pdf(''), 'scan.pdf', 'application/pdf');
    await expect(
      processIngest(ctx, t.job(scanned), { isLastAttempt: false }),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(await state(scanned)).toMatchObject({
      ingest_status: 'failed',
      ingest_error: expect.stringContaining('escaneada'),
      active: false,
    });

    const empty = await t.addVersion(2, new TextEncoder().encode('   '));
    await expect(processIngest(ctx, t.job(empty), { isLastAttempt: false })).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    expect(await state(empty)).toMatchObject({
      ingest_status: 'failed',
      ingest_error: 'O arquivo não tem texto.',
    });

    const noEmbeddings = await t.addVersion(3, new TextEncoder().encode(POP));
    await expect(
      processIngest({ ...ctx, embeddings: undefined }, t.job(noEmbeddings), {
        isLastAttempt: false,
      }),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(await state(noEmbeddings)).toMatchObject({
      ingest_status: 'failed',
      ingest_error: expect.stringContaining('embeddings'),
    });
  });

  it('a provider outage retries; only the last attempt marks it failed', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    embedFailure = new EmbeddingsError('embeddings provider returned 503', true);
    try {
      await expect(processIngest(ctx, t.job(v1), { isLastAttempt: false })).rejects.toThrow('503');
      expect(await state(v1)).toMatchObject({ ingest_status: 'processing' });
      await expect(processIngest(ctx, t.job(v1), { isLastAttempt: true })).rejects.toThrow('503');
      expect(await state(v1)).toMatchObject({
        ingest_status: 'failed',
        ingest_error: 'embeddings provider returned 503',
      });
    } finally {
      embedFailure = null;
    }
  });

  it('ignores versions that are not approved and unknown ones', async () => {
    const t = await setup();
    const v1 = await t.addVersion(1, new TextEncoder().encode(POP));
    await runSql(s, `update document_versions set status = 'obsoleto' where id = $1`, [v1]);
    expect(await processIngest(ctx, t.job(v1), { isLastAttempt: false })).toEqual({
      status: 'skipped',
      reason: 'status is obsoleto',
    });
    await expect(
      processIngest(ctx, t.job(randomUUID()), { isLastAttempt: false }),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it('keeps tenants apart: a version id from another tenant is "not found"', async () => {
    const a = await setup();
    const b = await setup();
    const vb = await b.addVersion(1, new TextEncoder().encode(POP));
    await expect(
      processIngest(ctx, { tenantId: a.tenantId, versionId: vb }, { isLastAttempt: false }),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});
