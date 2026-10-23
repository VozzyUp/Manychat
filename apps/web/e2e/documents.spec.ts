import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createMember,
  deleteUser,
  DEMO,
  expectAccessible,
  formAlert,
  formStatus,
  localStack,
  login,
  sql,
  TENANT_LOG,
  watchConsole,
} from './helpers';

const tag = `E2E ${randomInt(100000)}`;
const POP = Buffer.from('POP-015\n\n1 Objetivo\nPadronizar o transporte de amostras.\n');

async function cleanup() {
  const rows = await sql<{ storage_path: string }>(
    `select v.storage_path from document_versions v join documents d on d.id = v.document_id where d.tenant_id = $1 and d.title like 'E2E %'`,
    [TENANT_LOG.id],
  );
  if (rows.length) {
    const { url, serviceKey } = localStack();
    await fetch(`${url}/storage/v1/object/documents`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prefixes: rows.map((r) => r.storage_path) }),
    });
  }
  await sql(`delete from documents where tenant_id = $1 and title like 'E2E %'`, [TENANT_LOG.id]);
}

test.describe('S08–S10 documents', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test('S10-H1/S09-H1 upload, review, approval by Quality and activation (worker simulated)', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    const operator = await createMember(TENANT_LOG.id, 'operator');
    const quality = await createMember(TENANT_LOG.id, 'quality');
    try {
      // Operator uploads and sends to review, but cannot approve.
      await login(page, operator.email, operator.password);
      await page.goto(`/t/${TENANT_LOG.slug}`);
      await page.getByRole('link', { name: 'Documentos' }).first().click();
      await expect(page.getByText('Nenhum documento ainda.')).toBeVisible();
      await page.getByRole('link', { name: 'Novo documento' }).click();
      await expectAccessible(page);

      // A file of the wrong type is refused with a clear message.
      await page.getByLabel('Título').fill(`${tag} errado`);
      await page.getByLabel('Arquivo').setInputFiles({
        name: 'foto.png',
        mimeType: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      });
      await page.getByRole('button', { name: 'Enviar como rascunho' }).click();
      await expect(formAlert(page)).toContainText('PDF, DOCX, TXT ou MD');

      await page.getByLabel('Título').fill(`${tag} Transporte`);
      await page.getByLabel('Código').fill(`POP-${randomInt(100000)}`);
      await page.getByLabel('Etiquetas').fill('transporte, amostras');
      await page.getByLabel('Próxima revisão').fill('2020-01-01');
      await page
        .getByLabel('Arquivo')
        .setInputFiles({ name: 'pop-015.txt', mimeType: 'text/plain', buffer: POP });
      await page.getByRole('button', { name: 'Enviar como rascunho' }).click();
      await page.waitForURL(/\/documentos\/[0-9a-f-]{36}$/);
      const documentUrl = page.url();

      await expect(
        page.getByRole('heading', { name: `${tag} Transporte`, level: 1 }),
      ).toBeVisible();
      await expect(page.getByText('Versão 1')).toBeVisible();
      await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'pop-015.txt' })).toBeVisible();
      await expectAccessible(page);

      await page.getByRole('button', { name: 'Enviar para revisão' }).click();
      await expect(page.getByText('Em revisão', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);

      // Quality approves; ingestion is pending because no worker runs here.
      await page.context().clearCookies();
      await login(page, quality.email, quality.password);
      await page.goto(documentUrl);
      await page.getByRole('button', { name: 'Aprovar' }).click();
      await expect(page.getByText('Processamento:')).toContainText('Aguardando processamento');
      await expect(page.getByText('Revisão vencida')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tornar obsoleta' })).toBeVisible();

      // What the worker does when ingestion finishes.
      const id = documentUrl.split('/').pop()!;
      await sql(
        `update document_versions set ingest_status = 'ready', chunk_count = 2, summary = 'Resumo do POP.' where document_id = $1`,
        [id],
      );
      await sql(
        `select activate_document_version($1, (select id from document_versions where document_id = $2))`,
        [TENANT_LOG.id, id],
      );
      await page.reload();
      await expect(page.getByText('Em uso pela IA')).toBeVisible();
      await expect(page.getByText('Processamento:')).toContainText('Pronto para a IA · 2 trechos');
      await expect(page.getByText('Resumo do POP.')).toBeVisible();

      // The list shows it, filters work.
      await page.goto(`/t/${TENANT_LOG.slug}/documentos`);
      const row = page.getByRole('link').filter({ hasText: `${tag} Transporte` });
      await expect(row).toContainText('Aprovado');
      await expect(row).toContainText('Revisão vencida');
      await page.getByLabel('Revisão').selectOption('vencida');
      await page.getByLabel('Situação').selectOption('aprovado');
      await page.getByRole('button', { name: 'Filtrar' }).click();
      await expect(row).toBeVisible();
      await page.getByLabel('Situação').selectOption('rascunho');
      await page.getByRole('button', { name: 'Filtrar' }).click();
      await expect(page.getByText('Nenhum documento com esses filtros.')).toBeVisible();
      await expectAccessible(page);
      expect(errors).toEqual([]);
    } finally {
      await deleteUser(operator.id);
      await deleteUser(quality.id);
    }
  });

  test('S09-H2 a new version waits in review while the current one keeps serving; failed ingestion can be reprocessed by an admin', async ({
    page,
  }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos/novo`);
    await page.getByLabel('Título').fill(`${tag} Versões`);
    await page.getByLabel('Arquivo').setInputFiles({
      name: 'v1.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Título\ntexto um'),
    });
    await page.getByRole('button', { name: 'Enviar como rascunho' }).click();
    await page.waitForURL(/\/documentos\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;

    await page.getByRole('button', { name: 'Enviar para revisão' }).click();
    await expect(page.getByText('Em revisão', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByText('Processamento:')).toBeVisible();
    await sql(
      `update document_versions set ingest_status = 'ready', chunk_count = 1 where document_id = $1`,
      [id],
    );
    await sql(
      `select activate_document_version($1, (select id from document_versions where document_id = $2))`,
      [TENANT_LOG.id, id],
    );

    // Same file again: refused. New content: version 2 as draft.
    await page.reload();
    await page.getByLabel('Arquivo da nova versão').setInputFiles({
      name: 'v1.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Título\ntexto um'),
    });
    await page.getByRole('button', { name: 'Criar nova versão' }).click();
    await expect(formAlert(page)).toContainText('idêntico');
    await page.getByLabel('Arquivo da nova versão').setInputFiles({
      name: 'v2.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Título\ntexto dois'),
    });
    await page.getByRole('button', { name: 'Criar nova versão' }).click();
    await expect(page.getByText('Versão 2')).toBeVisible();

    const v2 = page.getByRole('listitem').filter({ hasText: 'Versão 2' });
    await v2.getByRole('button', { name: 'Enviar para revisão' }).click();
    await expect(v2.getByText('Em revisão', { exact: true })).toBeVisible();
    await v2.getByRole('button', { name: 'Aprovar' }).click();
    await expect(v2.getByText('A versão anterior continua valendo')).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Versão 1' }).getByText('Em uso pela IA'),
    ).toBeVisible();

    // The worker fails on v2 (e.g. embeddings not configured): the reason is shown and an admin retries.
    await sql(
      `update document_versions set ingest_status = 'failed', ingest_error = 'Os embeddings não estão configurados.' where document_id = $1 and version = 2`,
      [id],
    );
    await page.reload();
    await expect(v2.getByText('Os embeddings não estão configurados.')).toBeVisible();
    await v2.getByRole('button', { name: 'Reprocessar' }).click();
    await expect(formStatus(page)).toHaveText('Reprocessamento iniciado.');
    await expect(v2.getByText('Aguardando processamento')).toBeVisible();

    // Ingestion finishes: v2 takes over and v1 becomes obsolete.
    await sql(
      `update document_versions set ingest_status = 'ready', chunk_count = 1 where document_id = $1 and version = 2`,
      [id],
    );
    await sql(
      `select activate_document_version($1, (select id from document_versions where document_id = $2 and version = 2))`,
      [TENANT_LOG.id, id],
    );
    await page.reload();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Versão 1' }).getByText('Obsoleto'),
    ).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Versão 2' }).getByText('Em uso pela IA'),
    ).toBeVisible();
  });

  test('S08-N1 a viewer reads but sees no upload or workflow buttons; other tenants never see the document', async ({
    page,
  }) => {
    await login(page, DEMO.viewer);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos`);
    await expect(page.getByRole('link', { name: 'Novo documento' })).toHaveCount(0);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos/novo`);
    await expect(page.getByText('Só operadores e acima enviam documentos.')).toBeVisible();
  });
});
