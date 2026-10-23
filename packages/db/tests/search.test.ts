import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  asOwner,
  asUser,
  closePool,
  describeDb,
  expectRefused,
  expectSqlError,
  inRollback,
  type Db,
} from './helpers/pg';
import { createWorld, type World } from './helpers/world';

const DIMS = 1536;
/** A unit-ish vector pointing mostly at axis `axis` (so cosine similarity is easy to reason about). */
const vec = (axis: number, other = 0, otherAxis = 1) => {
  const v = Array.from({ length: DIMS }, () => 0);
  v[axis] = 1;
  v[otherAxis] = other;
  return `[${v.join(',')}]`;
};

const rows = async <T extends Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
) => (await db.query<T>(sql, params)).rows;

type Doc = { collection?: string; title: string; code?: string; active?: boolean; status?: string };

async function addChunk(
  db: Db,
  tenantId: string,
  doc: Doc,
  chunk: { content: string; section?: string; embedding: string; model?: string; page?: number },
) {
  const [d] = await rows<{ id: string }>(
    db,
    `insert into documents (tenant_id, collection, code, title) values ($1, $2, $3, $4) returning id`,
    [tenantId, doc.collection ?? 'pop', doc.code ?? null, doc.title],
  );
  const status = doc.status ?? 'aprovado';
  const [v] = await rows<{ id: string }>(
    db,
    `insert into document_versions (tenant_id, document_id, version, storage_path, filename, mime, size, sha256, status, approved_at, activated_at, ingest_status)
     values ($1, $2, 3, $3, 'a.txt', 'text/plain', 1, $4, 'rascunho', null, null, 'ready') returning id`,
    [tenantId, d!.id, `${tenantId}/${randomUUID()}.txt`, randomUUID()],
  );
  if (status !== 'rascunho') {
    await db.query(`update document_versions set status = 'em_revisao' where id = $1`, [v!.id]);
    if (status === 'aprovado') {
      await db.query(
        `update document_versions set status = 'aprovado', approved_at = now(), activated_at = $2 where id = $1`,
        [v!.id, doc.active === false ? null : new Date()],
      );
    }
  }
  const [c] = await rows<{ id: string }>(
    db,
    `insert into document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_path, page, content, token_count, embedding, embedding_model)
     values ($1, $2, $3, 0, $4, $5, $6, 20, $7::extensions.vector, $8) returning id`,
    [
      tenantId,
      d!.id,
      v!.id,
      chunk.section ?? null,
      chunk.page ?? 1,
      chunk.content,
      chunk.embedding,
      chunk.model ?? 'm1',
    ],
  );
  return { doc: d!.id, version: v!.id, chunk: c!.id };
}

const search = (
  db: Db,
  world: World,
  query: string,
  embedding: string,
  opts: {
    collections?: string[];
    model?: string;
    minSim?: number;
    limit?: number;
    tenant?: string;
  } = {},
) =>
  rows<{
    chunk_id: string;
    title: string;
    similarity: number;
    score: number;
    version: number;
    section_path: string | null;
    page: number;
  }>(db, `select * from search_knowledge($1, $2, $3::extensions.vector, $4, $5, $6, $7)`, [
    opts.tenant ?? world.tenants.A,
    query,
    embedding,
    opts.model ?? 'm1',
    opts.collections ?? ['pop', 'manual'],
    opts.limit ?? 6,
    opts.minSim ?? 0.3,
  ]);

describeDb('search_knowledge (ESCOPO §4.5, ADR-0005)', () => {
  afterAll(closePool);

  it('only the service role can run it', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.ownerA);
      await expectSqlError(
        db,
        '42501',
        `select * from search_knowledge($1, 'x', $2::extensions.vector, 'm1', '{pop}')`,
        [world.tenants.A, vec(0)],
      );
    });
  });

  it('fuses vector and full-text: a chunk strong in both beats one strong in a single list', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      const both = await addChunk(
        db,
        world.tenants.A,
        { title: 'Ambos' },
        {
          content: 'A temperatura da câmara fria deve ficar entre 2 e 8 graus.',
          embedding: vec(0, 0.2),
        },
      );
      const vecOnly = await addChunk(
        db,
        world.tenants.A,
        { title: 'Só vetor' },
        { content: 'Registro de limpeza semanal.', embedding: vec(0, 0.1, 2) },
      );
      const ftsOnly = await addChunk(
        db,
        world.tenants.A,
        { title: 'Só texto' },
        { content: 'A câmara fria precisa de manutenção anual.', embedding: vec(0, 0.9, 3) },
      );

      const hits = await search(db, world, 'temperatura da câmara fria', vec(0), { minSim: 0.3 });
      expect(hits.map((h) => h.chunk_id)[0]).toBe(both.chunk);
      expect(hits.map((h) => h.chunk_id).sort()).toEqual(
        [both.chunk, vecOnly.chunk, ftsOnly.chunk].sort(),
      );
      expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
      expect(hits[0]).toMatchObject({ title: 'Ambos', version: 3, page: 1 });
    });
  });

  it('is accent- and stem-insensitive in Portuguese', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      // Vector says "unrelated" (axis 5); only the text can find it.
      const c = await addChunk(
        db,
        world.tenants.A,
        { title: 'Transporte' },
        {
          content: 'Os tubos devem ser transportados na caixa térmica.',
          embedding: vec(5, 0.99, 6),
        },
      );
      const hits = await search(db, world, 'Como transportar tubos? caixa termica', vec(0), {
        minSim: -1,
      });
      expect(hits.map((h) => h.chunk_id)).toEqual([c.chunk]);
    });
  });

  it('returns nothing below the similarity floor, even when the words match', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Longe' },
        { content: 'Temperatura da câmara fria.', embedding: vec(7, 1, 8) },
      );
      expect(await search(db, world, 'temperatura câmara fria', vec(0), { minSim: 0.3 })).toEqual(
        [],
      );
      expect(await search(db, world, '', vec(0), { minSim: 0.3 })).toEqual([]);
    });
  });

  it('only approved, activated versions of the agent collections and the configured model are searched', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      const ok = await addChunk(
        db,
        world.tenants.A,
        { title: 'Vigente' },
        { content: 'texto vigente da câmara', embedding: vec(0) },
      );
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Rascunho', status: 'rascunho' },
        { content: 'texto rascunho da câmara', embedding: vec(0) },
      );
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Em revisão', status: 'em_revisao' },
        { content: 'texto revisão da câmara', embedding: vec(0) },
      );
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Ainda processando', active: false },
        { content: 'texto novo da câmara', embedding: vec(0) },
      );
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Contrato', collection: 'contrato' },
        { content: 'texto contrato da câmara', embedding: vec(0) },
      );
      await addChunk(
        db,
        world.tenants.A,
        { title: 'Outro modelo' },
        { content: 'texto modelo da câmara', embedding: vec(0), model: 'm2' },
      );
      const obsolete = await addChunk(
        db,
        world.tenants.A,
        { title: 'Obsoleta' },
        { content: 'texto obsoleto da câmara', embedding: vec(0) },
      );
      await db.query(`update document_versions set status = 'obsoleto' where id = $1`, [
        obsolete.version,
      ]);

      const hits = await search(db, world, 'texto da câmara', vec(0));
      expect(hits.map((h) => h.title)).toEqual(['Vigente']);
      expect(hits[0]!.chunk_id).toBe(ok.chunk);
      const scoped = await search(db, world, 'texto da câmara', vec(0), {
        collections: ['contrato'],
      });
      expect(scoped.map((h) => h.title)).toEqual(['Contrato']);
      expect(await search(db, world, 'texto da câmara', vec(0), { collections: [] })).toEqual([]);
    });
  });

  it('never returns another tenant’s chunks', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      await addChunk(
        db,
        world.tenants.B,
        { title: 'Da B' },
        { content: 'segredo da empresa B sobre a câmara', embedding: vec(0) },
      );
      expect(
        await search(db, world, 'segredo câmara', vec(0), { tenant: world.tenants.A }),
      ).toEqual([]);
      expect(
        (await search(db, world, 'segredo câmara', vec(0), { tenant: world.tenants.B })).map(
          (h) => h.title,
        ),
      ).toEqual(['Da B']);
    });
  });

  it('caps the result at the limit (default 6, at most 20)', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      for (let i = 0; i < 8; i += 1)
        await addChunk(
          db,
          world.tenants.A,
          { title: `Doc ${i}` },
          { content: `procedimento número ${i} da câmara`, embedding: vec(0, i / 100, 1) },
        );
      expect(await search(db, world, 'procedimento câmara', vec(0))).toHaveLength(6);
      expect(await search(db, world, 'procedimento câmara', vec(0), { limit: 3 })).toHaveLength(3);
      expect(await search(db, world, 'procedimento câmara', vec(0), { limit: 500 })).toHaveLength(
        8,
      );
    });
  });
});

describeDb('knowledge_gaps', () => {
  afterAll(closePool);

  it('quality reads and resolves; operators and viewers see nothing; nobody creates or deletes through the API', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      const [gap] = await rows<{ id: string }>(
        db,
        `insert into knowledge_gaps (tenant_id, question, reason) values ($1, 'Qual o prazo?', 'no_knowledge') returning id`,
        [world.tenants.A],
      );

      await asUser(db, world.users.viewerA);
      expect(await rows(db, `select id from knowledge_gaps`)).toHaveLength(0);

      await asUser(db, world.users.qualityA);
      expect(await rows(db, `select id from knowledge_gaps`)).toHaveLength(1);
      await expectSqlError(
        db,
        '42501',
        `insert into knowledge_gaps (tenant_id, question, reason) values ($1, 'x', 'no_knowledge')`,
        [world.tenants.A],
      );
      await expectSqlError(db, '42501', `delete from knowledge_gaps where id = $1`, [gap!.id]);
      await expectSqlError(
        db,
        '42501',
        `update knowledge_gaps set question = 'outra' where id = $1`,
        [gap!.id],
      );
      await db.query(
        `update knowledge_gaps set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1`,
        [gap!.id, world.users.qualityA],
      );

      await asUser(db, world.users.ownerB);
      expect(await rows(db, `select id from knowledge_gaps`)).toHaveLength(0);
      await expectRefused(
        db,
        `update knowledge_gaps set status = 'open', resolved_at = null where id = $1`,
        [gap!.id],
      );
    });
  });
});
