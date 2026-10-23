import { randomUUID } from 'node:crypto';
import { createServiceDb } from '@nurion/db';
import { createTestTenant, findLocalStack, runSql, type LocalStack } from '@nurion/db/testing';
import { createLogger } from '@nurion/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKnowledgeSearch,
  EMBEDDING_DIMENSIONS,
  parsePricing,
  type EmbeddingsProvider,
  type KnowledgeSearch,
} from '../src';

const stack = await findLocalStack('core knowledge search');
const describeStack = stack ? describe : describe.skip;

/** Text → vector on axis 0 when it mentions "temperatura", axis 1 for "limpeza", else axis 2. */
const axisOf = (text: string) => (/temperatura/i.test(text) ? 0 : /limpeza/i.test(text) ? 1 : 2);
const vector = (axis: number) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));

describeStack('createKnowledgeSearch against the local stack (embeddings mocked)', () => {
  const s = stack as LocalStack;
  const tenants: Awaited<ReturnType<typeof createTestTenant>>[] = [];
  const embedded: string[] = [];
  const embeddings: EmbeddingsProvider = {
    model: 'test-embed',
    async embed(texts) {
      embedded.push(...texts);
      return { vectors: texts.map((t) => vector(axisOf(t))), tokens: texts.length * 12 };
    },
  };
  let search: KnowledgeSearch;

  beforeAll(() => {
    search = createKnowledgeSearch({
      db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
      embeddings,
      pricing: parsePricing('{"test-embed":{"input":0.02,"output":0}}'),
      logger: createLogger('search-test', { level: 'silent' }),
    })!;
  });
  afterAll(async () => {
    for (const t of tenants) await t.drop();
  });

  async function setup(settings?: Record<string, unknown>) {
    const tenant = await createTestTenant(s, ['consult']);
    tenants.push(tenant);
    if (settings)
      await runSql(s, `update tenants set settings = settings || $2::jsonb where id = $1`, [
        tenant.tenantId,
        settings,
      ]);
    const add = async (
      title: string,
      collection: string,
      content: string,
      section: string,
      axis = axisOf(content),
      active = true,
    ) => {
      const [d] = await runSql<{ id: string }>(
        s,
        `insert into documents (tenant_id, collection, code, title) values ($1, $2, $3, $4) returning id`,
        [tenant.tenantId, collection, `C-${randomUUID().slice(0, 5)}`, title],
      );
      const [v] = await runSql<{ id: string }>(
        s,
        `insert into document_versions (tenant_id, document_id, version, storage_path, filename, mime, size, sha256, status, approved_at, activated_at, ingest_status)
         values ($1, $2, 2, 'p', 'a.txt', 'text/plain', 1, $3, 'aprovado', now(), $4, 'ready') returning id`,
        [tenant.tenantId, d!.id, randomUUID(), active ? new Date() : null],
      );
      const [c] = await runSql<{ id: string }>(
        s,
        `insert into document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_path, page, content, token_count, embedding, embedding_model)
         values ($1, $2, $3, 0, $4, 5, $5, 10, $6::extensions.vector, 'test-embed') returning id`,
        [tenant.tenantId, d!.id, v!.id, section, content, `[${vector(axis).join(',')}]`],
      );
      return { chunk: c!.id, version: v!.id };
    };
    return { ...tenant, add };
  }

  it('embeds the question, finds the passage and returns what the citation needs', async () => {
    const t = await setup();
    const a = await t.add(
      'Transporte de amostras',
      'pop',
      'A temperatura da câmara fria deve ficar entre 2 e 8 graus.',
      '4.2 Temperatura',
    );
    await t.add('Limpeza', 'pop', 'A limpeza do baú é semanal.', '3 Limpeza');
    embedded.length = 0;
    const hits = await search({
      tenantId: t.tenantId,
      conversationId: null,
      query: 'Qual a temperatura da câmara?',
      collections: ['pop'],
    });
    expect(embedded).toEqual(['Qual a temperatura da câmara?']);
    expect(hits.map((h) => h.chunkId)).toEqual([a.chunk]);
    expect(hits[0]).toMatchObject({
      title: 'Transporte de amostras',
      section: '4.2 Temperatura',
      version: '2',
      page: 5,
      documentVersionId: a.version,
      similarity: expect.closeTo(1, 5),
      text: expect.stringContaining('2 e 8 graus'),
    });
    const [run] = await runSql<{
      agent_key: string;
      model: string;
      input_tokens: number;
      cost_usd: string;
    }>(
      s,
      `select agent_key, model, input_tokens, cost_usd::text from ai_runs where tenant_id = $1`,
      [t.tenantId],
    );
    expect(run).toEqual({
      agent_key: 'search.embedding',
      model: 'test-embed',
      input_tokens: 12,
      cost_usd: '0.000000',
    });
  });

  it('respects the collections of the agent, versions still processing and the tenant', async () => {
    const t = await setup();
    const other = await setup();
    await t.add('Contrato', 'contrato', 'Cláusula de temperatura do contrato.', '1');
    await t.add('Novo', 'pop', 'Nova temperatura ainda sem processar.', '1', 0, false);
    await other.add('Da outra empresa', 'pop', 'Temperatura da outra empresa.', '1');
    const mine = await search({
      tenantId: t.tenantId,
      conversationId: null,
      query: 'temperatura',
      collections: ['pop'],
    });
    expect(mine).toEqual([]);
    const contracts = await search({
      tenantId: t.tenantId,
      conversationId: null,
      query: 'temperatura',
      collections: ['contrato'],
    });
    expect(contracts.map((h) => h.title)).toEqual(['Contrato']);
    expect(
      await search({
        tenantId: t.tenantId,
        conversationId: null,
        query: 'temperatura',
        collections: [],
      }),
    ).toEqual([]);
  });

  it('nothing relevant → empty (which forces the handoff); the floor can be tuned per tenant', async () => {
    const t = await setup();
    await t.add('Limpeza', 'pop', 'A limpeza do baú é semanal.', '3 Limpeza');
    expect(
      await search({
        tenantId: t.tenantId,
        conversationId: null,
        query: 'temperatura da câmara',
        collections: ['pop'],
      }),
    ).toEqual([]);

    // With the floor at 0 everything above it comes back: proves the floor is what filtered it.
    expect(
      (
        await search({
          tenantId: t.tenantId,
          conversationId: null,
          query: 'temperatura da câmara',
          collections: ['pop'],
          minSimilarity: 0,
        })
      ).length,
    ).toBe(1);
    const lax = await setup({ rag: { min_similarity: 0 } });
    await lax.add('Limpeza', 'pop', 'A limpeza do baú é semanal.', '3 Limpeza');
    expect(
      (
        await search({
          tenantId: lax.tenantId,
          conversationId: null,
          query: 'temperatura da câmara',
          collections: ['pop'],
        })
      ).length,
    ).toBe(1);
  });

  it('is not created without an embeddings provider', () => {
    expect(
      createKnowledgeSearch({
        db: createServiceDb({ url: s.url, serviceRoleKey: s.serviceKey }),
        pricing: {},
        logger: createLogger('x', { level: 'silent' }),
      }),
    ).toBeUndefined();
  });
});
