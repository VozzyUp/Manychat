import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createMember,
  deleteUser,
  DEMO,
  expectAccessible,
  login,
  sql,
  TENANT_LOG,
  watchConsole,
} from './helpers';

const title = `E2E Base ${randomUUID().slice(0, 6)}`;
const vec = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;

async function cleanup() {
  await sql(`delete from documents where tenant_id = $1 and title like 'E2E Base %'`, [
    TENANT_LOG.id,
  ]);
  await sql(`delete from knowledge_gaps where tenant_id = $1 and question like 'E2E %'`, [
    TENANT_LOG.id,
  ]);
  await sql(
    `delete from ai_runs where tenant_id = $1 and agent_key in ('knowledge.test', 'search.embedding')`,
    [TENANT_LOG.id],
  );
}

test.describe('S11 Testar a base and S12 Perguntas sem resposta', () => {
  test.beforeAll(async () => {
    await cleanup();
    // An approved, ingested and active version with one chunk (what the worker would have produced).
    const [doc] = await sql<{ id: string }>(
      `insert into documents (tenant_id, collection, code, title) values ($1, 'pop', 'POP-E2E', $2) returning id`,
      [TENANT_LOG.id, title],
    );
    const [v] = await sql<{ id: string }>(
      `insert into document_versions (tenant_id, document_id, version, storage_path, filename, mime, size, sha256, status, approved_at, activated_at, ingest_status)
       values ($1, $2, 3, 'x', 'pop.txt', 'text/plain', 1, $3, 'aprovado', now(), now(), 'ready') returning id`,
      [TENANT_LOG.id, doc!.id, randomUUID()],
    );
    await sql(
      `insert into document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_path, page, content, token_count, embedding, embedding_model)
       values ($1, $2, $3, 0, '4.2 Temperatura', 2, 'A caixa térmica deve manter a temperatura entre 2 e 8 graus durante todo o trajeto.', 20, $4::extensions.vector, 'e2e-embed')`,
      [TENANT_LOG.id, doc!.id, v!.id, vec],
    );
  });
  test.afterAll(cleanup);

  test('S11-H1 a manager asks the base: answer with the source line and the passage marked as used', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos`);
    await page.getByRole('link', { name: 'Testar a base' }).click();
    await expectAccessible(page);
    await page.getByLabel('Pergunta', { exact: true }).fill('Qual a temperatura da caixa térmica?');
    await page.getByLabel('POP', { exact: true }).check();
    await page.getByRole('button', { name: 'Perguntar' }).click();

    const answer = page.getByRole('main').getByText('A temperatura deve ficar entre 2 e 8 °C.');
    await expect(answer).toBeVisible();
    await expect(page.getByText(`📄 Fonte: ${title}, 4.2 Temperatura (v3)`)).toBeVisible();
    const passage = page.getByRole('list', { name: 'Trechos encontrados' }).getByRole('listitem');
    await expect(passage).toHaveCount(1);
    await expect(passage).toContainText('POP-E2E');
    await expect(passage).toContainText('p. 2');
    await expect(passage).toContainText('relevância 100%');
    await expect(passage).toContainText('Usado na resposta');
    await expect(page.getByText(/Custo desta consulta: US\$ 0\.00\d\d/)).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);

    const [run] = await sql<{ outcome: string; citations: string }>(
      `select r.outcome, (select count(*) from ai_citations c where c.ai_run_id = r.id)::text as citations from ai_runs r where r.tenant_id = $1 and r.agent_key = 'knowledge.test' order by r.created_at desc limit 1`,
      [TENANT_LOG.id],
    );
    expect(run).toEqual({ outcome: 'answered', citations: '1' });
  });

  test('S11-N1 a question the base does not cover: no answer, nothing used, no invented source', async ({
    page,
  }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos/testar`);
    await page.getByLabel('Pergunta', { exact: true }).fill('Pergunta impossível de responder');
    await page.getByRole('button', { name: 'Perguntar' }).click();
    await expect(
      page.getByText('Sem resposta: no WhatsApp, a conversa iria para uma pessoa da equipe.'),
    ).toBeVisible();
    await expect(page.getByText('A base não cobre esse assunto.')).toBeVisible();
    await expect(page.getByText('Nenhum trecho passou do limiar de relevância.')).toBeVisible();
    await expect(page.getByText('📄 Fonte')).toHaveCount(0);
  });

  test('S11-N2 a Quality user cannot test the base (manager+), but sees the unanswered questions', async ({
    page,
  }) => {
    const quality = await createMember(TENANT_LOG.id, 'quality');
    try {
      await login(page, quality.email, quality.password);
      await page.goto(`/t/${TENANT_LOG.slug}/documentos`);
      await expect(page.getByRole('link', { name: 'Testar a base' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Perguntas sem resposta' })).toBeVisible();
      await page.goto(`/t/${TENANT_LOG.slug}/documentos/testar`);
      await expect(page.getByText('Só gestores e acima testam a base')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Perguntar' })).toHaveCount(0);
    } finally {
      await deleteUser(quality.id);
    }
  });

  test('S12-H1 unanswered questions: list, resolve, reopen; viewers see nothing', async ({
    page,
  }) => {
    await sql(
      `insert into knowledge_gaps (tenant_id, question, reason) values ($1, 'E2E Qual o prazo do reagente X?', 'no_knowledge')`,
      [TENANT_LOG.id],
    );
    await login(page, DEMO.quality);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos/lacunas`);
    await expectAccessible(page);
    const row = page.getByRole('listitem').filter({ hasText: 'E2E Qual o prazo do reagente X?' });
    await expect(row).toContainText('Nenhum trecho encontrado');
    await row.getByRole('button', { name: 'Marcar como resolvida' }).click();
    await expect(row).toHaveCount(0);

    await page.getByRole('link', { name: 'Resolvidas' }).click();
    const resolved = page
      .getByRole('listitem')
      .filter({ hasText: 'E2E Qual o prazo do reagente X?' });
    await expect(resolved).toBeVisible();
    await resolved.getByRole('button', { name: 'Reabrir' }).click();
    await expect(resolved).toHaveCount(0);
    await page.getByRole('link', { name: 'Abertas' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'E2E Qual o prazo do reagente X?' }),
    ).toBeVisible();

    await page.context().clearCookies();
    await login(page, DEMO.viewer);
    await page.goto(`/t/${TENANT_LOG.slug}/documentos/lacunas`);
    await expect(
      page.getByText('Só a Qualidade (ou acima) vê as perguntas sem resposta.'),
    ).toBeVisible();
    await expect(page.getByText('E2E Qual o prazo')).toHaveCount(0);
  });
});
