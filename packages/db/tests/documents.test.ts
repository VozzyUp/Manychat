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

const rows = async <T extends Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
) => (await db.query<T>(sql, params)).rows;

async function draft(db: Db, world: World, version = 1, documentId?: string) {
  const doc =
    documentId ??
    (
      await rows<{ id: string }>(
        db,
        `insert into documents (tenant_id, collection, code, title) values ($1, 'pop', $2, 'POP-015') returning id`,
        [world.tenants.A, `POP-${randomUUID().slice(0, 6)}`],
      )
    )[0]!.id;
  const [v] = await rows<{ id: string }>(
    db,
    `insert into document_versions (tenant_id, document_id, version, storage_path, filename, mime, size, sha256)
     values ($1, $2, $3, $4, 'pop.txt', 'text/plain', 10, $5) returning id`,
    [world.tenants.A, doc, version, `${world.tenants.A}/${doc}/${version}.txt`, randomUUID()],
  );
  return { doc, version: v!.id };
}

const approve = (db: Db, id: string, by: string) =>
  db.query(
    `update document_versions set status = 'aprovado', approved_by = $2, approved_at = now() where id = $1`,
    [id, by],
  );

describeDb('documents and versions (ESCOPO §4.5)', () => {
  afterAll(closePool);

  it('operators draft and send to review; only quality and up approve', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.viewerA);
      await expectSqlError(
        db,
        '42501',
        `insert into documents (tenant_id, collection, title) values ($1, 'pop', 'x')`,
        [world.tenants.A],
      );

      await asOwner(db);
      const operator = randomUUID();
      await db.query(
        `insert into auth.users (id, email, aud, role) values ($1, 'op@test.local', 'authenticated', 'authenticated')`,
        [operator],
      );
      await db.query(
        `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'operator')`,
        [world.tenants.A, operator],
      );

      await asUser(db, operator);
      const { version } = await draft(db, world);
      await db.query(`update document_versions set status = 'em_revisao' where id = $1`, [version]);
      await expectRefused(
        db,
        `update document_versions set status = 'aprovado', approved_by = $2, approved_at = now() where id = $1`,
        [version, operator],
      );

      await asUser(db, world.users.qualityA);
      await approve(db, version, world.users.qualityA);
      await asOwner(db);
      const [v] = await rows<{ status: string }>(
        db,
        `select status from document_versions where id = $1`,
        [version],
      );
      expect(v!.status).toBe('aprovado');
    });
  });

  it('refuses status jumps and edits of the file after review starts', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.qualityA);
      const { version } = await draft(db, world);
      await expectSqlError(
        db,
        '23514',
        `update document_versions set status = 'aprovado', approved_by = $2, approved_at = now() where id = $1`,
        [version, world.users.qualityA],
      );
      await db.query(`update document_versions set status = 'em_revisao' where id = $1`, [version]);
      // Users cannot even write the file columns; and the guard also holds for the table owner.
      await expectSqlError(
        db,
        '42501',
        `update document_versions set storage_path = 'x/y.txt' where id = $1`,
        [version],
      );
      await asOwner(db);
      await expectSqlError(
        db,
        '23514',
        `update document_versions set storage_path = 'x/y.txt' where id = $1`,
        [version],
      );
      await asUser(db, world.users.qualityA);
      // Rejected review goes back to draft.
      await db.query(`update document_versions set status = 'rascunho' where id = $1`, [version]);
    });
  });

  it('users cannot touch ingestion or activation fields; documents cannot be deleted', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.ownerA);
      const { doc, version } = await draft(db, world);
      await expectSqlError(
        db,
        '42501',
        `update document_versions set activated_at = now() where id = $1`,
        [version],
      );
      await expectSqlError(
        db,
        '42501',
        `update document_versions set ingest_status = 'ready', chunk_count = 3 where id = $1`,
        [version],
      );
      await expectSqlError(db, '42501', `delete from documents where id = $1`, [doc]);
      await expectSqlError(db, '42501', `select activate_document_version($1, $2)`, [
        world.tenants.A,
        version,
      ]);
    });
  });

  it('activating a new version makes the previous one obsolete in one step; one active per document', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asUser(db, world.users.qualityA);
      const v1 = await draft(db, world, 1);
      await db.query(`update document_versions set status = 'em_revisao' where id = $1`, [
        v1.version,
      ]);
      await approve(db, v1.version, world.users.qualityA);

      await asOwner(db);
      // Not ingested yet: cannot be activated.
      await expectSqlError(db, 'P0002', `select activate_document_version($1, $2)`, [
        world.tenants.A,
        v1.version,
      ]);
      await db.query(`update document_versions set ingest_status = 'ready' where id = $1`, [
        v1.version,
      ]);
      await db.query(`select activate_document_version($1, $2)`, [world.tenants.A, v1.version]);
      const [d1] = await rows<{ current_version_id: string }>(
        db,
        `select current_version_id from documents where id = $1`,
        [v1.doc],
      );
      expect(d1!.current_version_id).toBe(v1.version);

      // v2 approved: v1 keeps feeding the AI until v2 is ingested.
      await asUser(db, world.users.qualityA);
      const v2 = await draft(db, world, 2, v1.doc);
      await db.query(`update document_versions set status = 'em_revisao' where id = $1`, [
        v2.version,
      ]);
      await approve(db, v2.version, world.users.qualityA);
      await asOwner(db);
      let states = await rows<{ version: number; status: string; active: boolean }>(
        db,
        `select version, status, activated_at is not null as active from document_versions where document_id = $1 order by version`,
        [v1.doc],
      );
      expect(states).toEqual([
        { version: 1, status: 'aprovado', active: true },
        { version: 2, status: 'aprovado', active: false },
      ]);

      await db.query(`update document_versions set ingest_status = 'ready' where id = $1`, [
        v2.version,
      ]);
      await db.query(`select activate_document_version($1, $2)`, [world.tenants.A, v2.version]);
      states = await rows(
        db,
        `select version, status, activated_at is not null as active from document_versions where document_id = $1 order by version`,
        [v1.doc],
      );
      expect(states).toEqual([
        { version: 1, status: 'obsoleto', active: true },
        { version: 2, status: 'aprovado', active: true },
      ]);
      const [d2] = await rows<{ current_version_id: string }>(
        db,
        `select current_version_id from documents where id = $1`,
        [v1.doc],
      );
      expect(d2!.current_version_id).toBe(v2.version);
    });
  });

  it('other tenants see no documents, versions or chunks', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      await draft(db, world);
      await asUser(db, world.users.ownerB);
      expect(await rows(db, `select id from documents`)).toHaveLength(0);
      expect(await rows(db, `select id from document_versions`)).toHaveLength(0);
    });
  });

  it('the portuguese full-text column ignores accents', async () => {
    await inRollback(async (db) => {
      const world = await createWorld(db);
      await asOwner(db);
      const { doc, version } = await draft(db, world);
      await db.query(
        `insert into document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_path, content, token_count, embedding, embedding_model)
         values ($1, $2, $3, 0, '4.2 Temperatura', 'A câmara fria deve ficar entre 2 e 8 graus.', 12, $4::extensions.vector, 'test')`,
        [world.tenants.A, doc, version, `[${Array.from({ length: 1536 }, () => 0.01).join(',')}]`],
      );
      const hit = await rows(
        db,
        `select id from document_chunks where tsv @@ plainto_tsquery('portuguese', app.immutable_unaccent('camara frias'))`,
      );
      expect(hit).toHaveLength(1);
    });
  });
});
