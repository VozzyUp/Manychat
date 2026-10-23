import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { as, buildTestApp, multipartForm } from './helpers/app';
import { createUser, describeStack, signIn, sql, stack } from './helpers/stack';
import { createApiWorld, type ApiWorld } from './helpers/world';

const txt = (body: string) => Buffer.from(body);
const POP = 'POP-015\n\n1 Objetivo\nPadronizar o transporte.';

describeStack('documents: upload, versions, approval and ingestion hand-off', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let w: ApiWorld;
  let operator: string;
  let quality: string;

  beforeAll(async () => {
    app = await buildTestApp();
    w = await createApiWorld();
    const [op, q] = await Promise.all([createUser('operador'), createUser('qualidade')]);
    await sql(
      `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'operator'), ($1, $3, 'quality')`,
      [w.tenants.A, op.id, q.id],
    );
    w.extraUserIds.push(op.id, q.id);
    operator = await signIn(op.email);
    quality = await signIn(q.email);
  }, 60_000);
  afterAll(async () => {
    await w?.cleanup();
    await app?.close();
  });

  const upload = (
    token: string,
    fields: Record<string, string>,
    file = { field: 'file', filename: 'pop.txt', contentType: 'text/plain', data: txt(POP) },
    url = '/v1/documents',
    tenant = w.tenants.A,
  ) => {
    const form = multipartForm(fields, file);
    return app.inject({
      method: 'POST',
      url,
      headers: { ...as(token, tenant), ...form.headers },
      payload: form.payload,
    });
  };
  const create = (fields: Record<string, string> = {}, data = txt(POP)) =>
    upload(
      operator,
      {
        title: 'Transporte de amostras',
        collection: 'pop',
        code: `POP-${randomUUID().slice(0, 6)}`,
        ...fields,
      },
      {
        field: 'file',
        filename: 'pop.txt',
        contentType: 'text/plain',
        data,
      },
    );
  const transition = (token: string, id: string, to: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/document-versions/${id}/transition`,
      headers: as(token, w.tenants.A),
      payload: { to },
    });

  it('an operator uploads a document: draft version 1, file in the private bucket, nothing ingested yet', async () => {
    const res = await create({
      tags: 'transporte, amostras',
      effective_date: '2026-11-01',
      review_date: '2027-11-01',
    });
    expect(res.statusCode, res.body).toBe(201);
    const doc = res.json();
    expect(doc).toMatchObject({
      collection: 'pop',
      title: 'Transporte de amostras',
      tags: ['transporte', 'amostras'],
      current_version_id: null,
    });
    expect(doc.version).toMatchObject({
      version: 1,
      status: 'rascunho',
      ingest_status: 'pending',
      filename: 'pop.txt',
      mime: 'text/plain',
      effective_date: '2026-11-01',
    });
    expect(app.ingests).toHaveLength(0);

    const [v] = await sql<{ storage_path: string; sha256: string }>(
      `select storage_path, sha256 from document_versions where id = $1`,
      [doc.version.id],
    );
    expect(v!.storage_path.startsWith(`${w.tenants.A}/${doc.id}/v1-`)).toBe(true);
    expect(v!.sha256).toHaveLength(64);
    const file = await fetch(`${stack.url}/storage/v1/object/documents/${v!.storage_path}`, {
      headers: { authorization: `Bearer ${stack.serviceKey}`, apikey: stack.serviceKey },
    });
    expect(await file.text()).toBe(POP);
  });

  it('refuses viewers, bad types, fake extensions, big files, duplicated codes and bad metadata', async () => {
    expect((await upload(w.tokens.viewer, { title: 'x', collection: 'pop' })).statusCode).toBe(403);
    const png = {
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      data: Buffer.from([0x89, 0x50]),
    };
    expect((await upload(operator, { title: 'x', collection: 'pop' }, png)).statusCode).toBe(400);
    // .pdf that is not a PDF.
    const fake = {
      field: 'file',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      data: txt('not a pdf'),
    };
    const r = await upload(operator, { title: 'x', collection: 'pop' }, fake);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toContain('PDF, DOCX, TXT ou MD');
    // Binary posing as txt.
    const bin = {
      field: 'file',
      filename: 'a.txt',
      contentType: 'text/plain',
      data: Buffer.from([0, 1, 2, 255]),
    };
    expect((await upload(operator, { title: 'x', collection: 'pop' }, bin)).statusCode).toBe(400);
    const big = {
      field: 'file',
      filename: 'a.txt',
      contentType: 'text/plain',
      data: Buffer.alloc(20 * 1024 * 1024 + 10, 'a'),
    };
    expect((await upload(operator, { title: 'x', collection: 'pop' }, big)).statusCode).toBe(413);

    const code = `POP-${randomUUID().slice(0, 6)}`;
    expect((await create({ code })).statusCode).toBe(201);
    const dup = await create({ code: code.toLowerCase() });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.message).toBe('Já existe um documento com esse código.');
    // The failed attempt left no empty document behind.
    const left = await sql(
      `select 1 from documents where tenant_id = $1 and lower(code) = lower($2)`,
      [w.tenants.A, code],
    );
    expect(left).toHaveLength(1);

    expect((await create({ collection: 'receita' })).statusCode).toBe(400);
    expect((await create({ title: '' })).statusCode).toBe(400);
    expect(
      (await create({ effective_date: '2026-12-01', review_date: '2026-01-01' })).statusCode,
    ).toBeGreaterThanOrEqual(400);
    const noFile = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: { ...as(operator, w.tenants.A), 'content-type': 'multipart/form-data; boundary=x' },
      payload: '--x--\r\n',
    });
    expect(noFile.statusCode).toBe(400);
  });

  it('runs the workflow: only quality+ approves; approving enqueues the ingestion once', async () => {
    const doc = (await create()).json();
    const v1 = doc.version.id;

    expect((await transition(operator, v1, 'aprovado')).statusCode).toBe(409); // must go through review
    expect((await transition(operator, v1, 'em_revisao')).json()).toMatchObject({
      status: 'em_revisao',
    });
    const denied = await transition(operator, v1, 'aprovado');
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toContain('Qualidade');
    expect(app.ingests).toHaveLength(0);

    // Rejected review goes back to draft and can be sent again.
    expect((await transition(quality, v1, 'rascunho')).json()).toMatchObject({
      status: 'rascunho',
    });
    await transition(operator, v1, 'em_revisao');

    const before = app.ingests.length;
    const approved = await transition(quality, v1, 'aprovado');
    expect(approved.json()).toMatchObject({ status: 'aprovado', ingest_status: 'pending' });
    expect(approved.json().approved_at).toBeTruthy();
    expect(app.ingests.length).toBe(before + 1);
    expect(app.ingests.at(-1)!.job).toEqual({ tenantId: w.tenants.A, versionId: v1 });
    const [row] = await sql<{ approved_by: string }>(
      `select approved_by from document_versions where id = $1`,
      [v1],
    );
    expect(row!.approved_by).toBeTruthy();
    expect((await transition(quality, v1, 'aprovado')).statusCode).toBe(409);
    expect((await transition(w.tokens.viewer, v1, 'obsoleto')).statusCode).toBe(403);
  });

  it('new versions get the next number; identical files are refused; the old one stays until the new is ingested', async () => {
    const doc = (await create()).json();
    await transition(operator, doc.version.id, 'em_revisao');
    await transition(quality, doc.version.id, 'aprovado');
    // The worker would do this: ingestion ready + activation.
    await sql(`update document_versions set ingest_status = 'ready' where id = $1`, [
      doc.version.id,
    ]);
    await sql(`select activate_document_version($1, $2)`, [w.tenants.A, doc.version.id]);

    const same = await upload(
      operator,
      {},
      { field: 'file', filename: 'pop.txt', contentType: 'text/plain', data: txt(POP) },
      `/v1/documents/${doc.id}/versions`,
    );
    expect(same.statusCode).toBe(409);
    expect(same.json().error.message).toContain('idêntico');

    const v2 = await upload(
      operator,
      { effective_date: '2026-12-01' },
      {
        field: 'file',
        filename: 'pop-v2.txt',
        contentType: 'text/plain',
        data: txt(`${POP}\nNovo item.`),
      },
      `/v1/documents/${doc.id}/versions`,
    );
    expect(v2.statusCode, v2.body).toBe(201);
    expect(v2.json()).toMatchObject({
      version: 2,
      status: 'rascunho',
      effective_date: '2026-12-01',
    });
    await transition(operator, v2.json().id, 'em_revisao');
    await transition(quality, v2.json().id, 'aprovado');

    const states = await sql<{ version: number; status: string }>(
      `select version, status from document_versions where document_id = $1 order by version`,
      [doc.id],
    );
    expect(states).toEqual([
      { version: 1, status: 'aprovado' },
      { version: 2, status: 'aprovado' },
    ]); // v1 still current

    // Another tenant cannot add versions to this document.
    const foreign = await upload(
      w.tokens.ownerB,
      {},
      undefined,
      `/v1/documents/${doc.id}/versions`,
      w.tenants.B,
    );
    expect(foreign.statusCode).toBe(404);
  });

  it("making the current version obsolete clears the document's current version", async () => {
    const doc = (await create()).json();
    await transition(operator, doc.version.id, 'em_revisao');
    await transition(quality, doc.version.id, 'aprovado');
    await sql(`update document_versions set ingest_status = 'ready' where id = $1`, [
      doc.version.id,
    ]);
    await sql(`select activate_document_version($1, $2)`, [w.tenants.A, doc.version.id]);
    expect((await transition(quality, doc.version.id, 'obsoleto')).json()).toMatchObject({
      status: 'obsoleto',
    });
    const [d] = await sql<{ current_version_id: string | null }>(
      `select current_version_id from documents where id = $1`,
      [doc.id],
    );
    expect(d!.current_version_id).toBeNull();
    expect((await transition(quality, doc.version.id, 'em_revisao')).statusCode).toBe(409);
  });

  it('edits metadata (operators) and dates; refuses a review date before the effective date', async () => {
    const doc = (await create()).json();
    const edit = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${doc.id}`,
      headers: as(operator, w.tenants.A),
      payload: { title: 'Novo título', tags: ['a'] },
    });
    expect(edit.json()).toMatchObject({ title: 'Novo título', tags: ['a'] });
    const viewer = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${doc.id}`,
      headers: as(w.tokens.viewer, w.tenants.A),
      payload: { title: 'x' },
    });
    expect(viewer.statusCode).toBe(403);
    const other = await app.inject({
      method: 'PATCH',
      url: `/v1/documents/${doc.id}`,
      headers: as(w.tokens.ownerB, w.tenants.B),
      payload: { title: 'x' },
    });
    expect(other.statusCode).toBe(404);

    const dates = await app.inject({
      method: 'PATCH',
      url: `/v1/document-versions/${doc.version.id}`,
      headers: as(operator, w.tenants.A),
      payload: { effective_date: '2026-12-01', review_date: '2027-06-01' },
    });
    expect(dates.json()).toMatchObject({ effective_date: '2026-12-01', review_date: '2027-06-01' });
    const bad = await app.inject({
      method: 'PATCH',
      url: `/v1/document-versions/${doc.version.id}`,
      headers: as(operator, w.tenants.A),
      payload: { review_date: '2026-01-01' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('reprocessing: only admins, only approved versions that failed or are pending', async () => {
    const doc = (await create()).json();
    const v1 = doc.version.id;
    const url = `/v1/document-versions/${v1}/reingest`;
    expect(
      (await app.inject({ method: 'POST', url, headers: as(w.tokens.admin, w.tenants.A) }))
        .statusCode,
    ).toBe(409); // still a draft
    await transition(operator, v1, 'em_revisao');
    await transition(quality, v1, 'aprovado');
    await sql(
      `update document_versions set ingest_status = 'failed', ingest_error = 'Os embeddings não estão configurados' where id = $1`,
      [v1],
    );

    expect(
      (await app.inject({ method: 'POST', url, headers: as(quality, w.tenants.A) })).statusCode,
    ).toBe(403);
    const before = app.ingests.length;
    const ok = await app.inject({ method: 'POST', url, headers: as(w.tokens.admin, w.tenants.A) });
    expect(ok.json()).toMatchObject({ ingest_status: 'pending', ingest_error: null });
    expect(app.ingests.length).toBe(before + 1);
    await sql(`update document_versions set ingest_status = 'ready' where id = $1`, [v1]);
    expect(
      (await app.inject({ method: 'POST', url, headers: as(w.tokens.admin, w.tenants.A) }))
        .statusCode,
    ).toBe(409);
  });

  it('an outsider and another tenant see nothing', async () => {
    const doc = (await create()).json();
    const out = await app.inject({
      method: 'POST',
      url: `/v1/document-versions/${doc.version.id}/transition`,
      headers: as(w.tokens.ownerB, w.tenants.B),
      payload: { to: 'em_revisao' },
    });
    expect(out.statusCode).toBe(404);
    const rows = await sql(`select 1 from documents where id = $1 and tenant_id = $2`, [
      doc.id,
      w.tenants.B,
    ]);
    expect(rows).toHaveLength(0);
  });
});
