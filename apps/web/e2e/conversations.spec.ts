import { randomInt, randomUUID } from 'node:crypto';
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
  TENANT_LAB,
  TENANT_LOG,
  watchConsole,
} from './helpers';

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');
const letters = (n: number) =>
  Array.from({ length: n }, () => 'bcdfghjklmnpqrstvwxz'[randomInt(20)]).join('');
// 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function putMedia(path: string) {
  const { url, serviceKey } = localStack();
  const res = await fetch(`${url}/storage/v1/object/media/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'image/png',
    },
    body: PNG,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
}

async function mediaExists(path: string) {
  const rows = await sql(`select 1 from storage.objects where bucket_id = 'media' and name = $1`, [
    path,
  ]);
  return rows.length > 0;
}

/** A conversation of its own (number, contact, messages, photo, open handoff) for one test file. */
async function createConversation(tenantId: string, contactName: string) {
  const numberId = randomUUID();
  const contactId = randomUUID();
  const conversationId = randomUUID();
  const waId = `55119${digits(8)}`;
  const imagePath = `${tenantId}/2026/10/e2e-${randomUUID()}.png`;
  await sql(
    `insert into whatsapp_numbers (id, tenant_id, phone_number_id, waba_id, display_number, access_token_enc, status)
     values ($1, $2, $3, '100000000000009', '+55 11 4000-0099', 'e2e', 'active')`,
    [numberId, tenantId, digits(15)],
  );
  await sql(
    `insert into contacts (id, tenant_id, wa_id, name, kind) values ($1, $2, $3, $4, 'driver')`,
    [contactId, tenantId, waId, contactName],
  );
  await sql(
    `insert into conversations (id, tenant_id, contact_id, whatsapp_number_id, module, last_inbound_at, last_message_at)
     values ($1, $2, $3, $4, 'log', now() - interval '1 hour', now() + interval '1 day')`,
    [conversationId, tenantId, contactId, numberId],
  );
  const [photo] = await sql<{ id: string }>(
    `insert into messages (tenant_id, conversation_id, wamid, direction, author, type, text, status, sent_at)
     values ($1, $2, $3, 'in', 'contact', 'image', 'Canhoto assinado', 'received', now() - interval '50 minutes')
     returning id`,
    [tenantId, conversationId, `wamid.${digits(20)}`],
  );
  await putMedia(imagePath);
  await sql(
    `insert into message_media (tenant_id, message_id, storage_path, mime, status) values ($1, $2, $3, 'image/png', 'stored')`,
    [tenantId, photo!.id, imagePath],
  );
  await sql(
    `insert into messages (tenant_id, conversation_id, wamid, direction, author, type, text, transcription, status, sent_at)
     values ($1, $2, $3, 'in', 'contact', 'audio', null, 'Termômetro marcando seis graus', 'received', now() - interval '45 minutes'),
            ($1, $2, null, 'out', 'ai', 'text', 'Foto recebida, obrigado.', null, 'delivered', now() - interval '44 minutes')`,
    [tenantId, conversationId, `wamid.${digits(20)}`],
  );
  await sql(
    `insert into messages (tenant_id, conversation_id, direction, author, type, text, status, error, sent_at)
     values ($1, $2, 'out', 'ai', 'text', 'Lembrete da coleta', 'failed', '{"code": "outside_window"}', now() - interval '40 minutes')`,
    [tenantId, conversationId],
  );
  // A PDF whose text was read and a voice note that could not be transcribed.
  const [pdf] = await sql<{ id: string }>(
    `insert into messages (tenant_id, conversation_id, wamid, direction, author, type, status, sent_at)
     values ($1, $2, $3, 'in', 'contact', 'document', 'received', now() - interval '42 minutes') returning id`,
    [tenantId, conversationId, `wamid.${digits(20)}`],
  );
  await sql(
    `insert into message_media (tenant_id, message_id, mime, filename, status, extracted_text)
     values ($1, $2, 'application/pdf', 'pedido.pdf', 'pending', 'Pedido de coleta 77 da unidade norte')`,
    [tenantId, pdf!.id],
  );
  const [voice] = await sql<{ id: string }>(
    `insert into messages (tenant_id, conversation_id, wamid, direction, author, type, status, sent_at)
     values ($1, $2, $3, 'in', 'contact', 'audio', 'received', now() - interval '41 minutes') returning id`,
    [tenantId, conversationId, `wamid.${digits(20)}`],
  );
  await sql(
    `insert into message_media (tenant_id, message_id, mime, status, error)
     values ($1, $2, 'audio/ogg', 'pending', 'Transcrição falhou: provider returned 503')`,
    [tenantId, voice!.id],
  );
  await sql(
    `insert into consents (tenant_id, contact_id, type, version) values ($1, $2, 'privacy_notice', '2026-10')`,
    [tenantId, contactId],
  );
  await sql(
    `insert into handoffs (tenant_id, conversation_id, reason, opened_by) values ($1, $2, 'urgency', 'ai')`,
    [tenantId, conversationId],
  );
  return {
    numberId,
    contactId,
    conversationId,
    waId,
    imagePath,
    async drop() {
      await sql(`delete from conversations where id = $1`, [conversationId]);
      await sql(`delete from contacts where id = $1`, [contactId]);
      await sql(`delete from whatsapp_numbers where id = $1`, [numberId]);
      const { url, serviceKey } = localStack();
      await fetch(`${url}/storage/v1/object/media`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [imagePath] }),
      });
    },
  };
}

test.describe('S04/S05 conversations', () => {
  let world: Awaited<ReturnType<typeof createConversation>>;
  const contactName = `Motorista E2E ${digits(4)}`;
  test.beforeAll(async () => {
    world = await createConversation(TENANT_LOG.id, contactName);
  });
  test.afterAll(async () => world?.drop());

  test('S04-H1 the list shows the conversation with its open handoff and filters by it', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}`);
    await page.getByRole('link', { name: 'Conversas' }).first().click();
    await expect(page.getByRole('heading', { name: 'Conversas', level: 1 })).toBeVisible();
    const row = page.getByRole('link').filter({ hasText: contactName });
    await expect(row).toContainText('Humano: Urgência');
    await expect(row).toContainText('Nurion Log');
    await expectAccessible(page);

    await page.getByLabel('Atendimento').selectOption('humano');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/atendimento=humano/);
    await expect(row).toBeVisible();
    // The seeded conversation without a handoff (João) is filtered out.
    await expect(page.getByRole('link').filter({ hasText: 'João Motorista' })).toHaveCount(0);

    await page.getByLabel('Módulo').selectOption('adm');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByText('Nenhuma conversa com esses filtros.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('S05-H1 messages with photo, transcription and send failure; closing the handoff', async ({
    page,
  }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/conversas/${world.conversationId}`);
    await expect(page.getByRole('heading', { name: contactName })).toBeVisible();

    const photo = page.getByRole('img', { name: 'Imagem enviada pelo contato' });
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await expect(page.getByText('Canhoto assinado')).toBeVisible();
    await expect(page.getByText('Termômetro marcando seis graus')).toBeVisible();
    await expect(page.getByText('Texto lido do PDF')).toBeVisible();
    await expect(page.getByText('Transcrição falhou: provider returned 503')).toBeVisible();
    await expect(page.getByText('Fora da janela de 24 h do WhatsApp')).toBeVisible();
    await expect(page.getByText('Entregue')).toBeVisible();
    await expect(page.getByText('Aberta', { exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Encerrar atendimento humano' }).click();
    await expect(formStatus(page)).toHaveText(
      'Atendimento humano encerrado. A IA volta a responder.',
    );
    await expect(page.getByText('Atendimento humano aberto')).toHaveCount(0);
    const [handoff] = await sql<{ status: string; closed_by_user_id: string | null }>(
      `select status, closed_by_user_id from handoffs where conversation_id = $1`,
      [world.conversationId],
    );
    expect(handoff).toMatchObject({ status: 'closed', closed_by_user_id: expect.any(String) });
  });

  test('S05-N1 a viewer reads but cannot close handoffs', async ({ page }) => {
    await sql(
      `insert into handoffs (tenant_id, conversation_id, reason) values ($1, $2, 'manual')`,
      [TENANT_LOG.id, world.conversationId],
    );
    await login(page, DEMO.viewer);
    await page.goto(`/t/${TENANT_LOG.slug}/conversas/${world.conversationId}`);
    await expect(page.getByText('Atendimento humano aberto')).toBeVisible();
    await expect(page.getByText('Motivo: Aberto pela equipe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Encerrar atendimento humano' })).toHaveCount(0);
  });

  test('S05-N2 another tenant never sees the conversation', async ({ page }) => {
    // The lab owner does not belong to the carrier: neither the carrier URL nor the id under the
    // lab's own URL reveals the conversation.
    await login(page, 'laboratorio@demo.local');
    await page.goto(`/t/${TENANT_LAB.slug}/conversas/${world.conversationId}`);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.goto(`/t/${TENANT_LOG.slug}/conversas/${world.conversationId}`);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.goto(`/t/${TENANT_LAB.slug}/conversas`);
    await expect(page.getByText(contactName)).toHaveCount(0);
  });
});

test.describe('S06/S07 contacts', () => {
  let world: Awaited<ReturnType<typeof createConversation>>;
  const contactName = `Contato E2E ${digits(4)}`;
  const created: string[] = [];
  test.beforeAll(async () => {
    world = await createConversation(TENANT_LOG.id, contactName);
  });
  test.afterAll(async () => {
    await world?.drop();
    if (created.length) await sql(`delete from contacts where id = any($1::uuid[])`, [created]);
  });

  test('S06-H1 register by typed phone (canonical id), refuse duplicates and bad numbers, search', async ({
    page,
  }) => {
    const local = `9${digits(7)}`; // 8-digit legacy mobile: the 9 is added
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}`);
    await page.getByRole('link', { name: 'Contatos' }).first().click();
    await expectAccessible(page);

    await page.getByLabel('WhatsApp').fill('11 2345-678x');
    await page.getByLabel('Nome').fill('Ninguém');
    await page.getByRole('button', { name: 'Cadastrar contato' }).click();
    await expect(formAlert(page)).toContainText('número');

    const word = `Zx${letters(6)}`;
    const name = `Motorista ${word}`;
    await page.getByLabel('WhatsApp').fill(`(21) ${local.slice(0, 4)}-${local.slice(4)}`);
    await page.getByLabel('Nome').fill(name);
    await page.getByLabel('Tipo', { exact: true }).selectOption('driver');
    await page.getByRole('button', { name: 'Cadastrar contato' }).click();
    await page.waitForURL(/\/contatos\/[0-9a-f-]{36}$/);
    created.push(page.url().split('/').pop()!);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(`+55 21 9${local.slice(0, 4)}-${local.slice(4)}`)).toBeVisible();

    await page.goto(`/t/${TENANT_LOG.slug}/contatos`);
    await page.getByLabel('WhatsApp').fill(`+55 21 9${local}`);
    await page.getByRole('button', { name: 'Cadastrar contato' }).click();
    await expect(formAlert(page)).toHaveText('Já existe um contato com esse número.');

    await page.getByLabel('Buscar').fill(word);
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('list', { name: 'Contatos' }).getByRole('listitem')).toHaveCount(1);
    await page.getByLabel('Buscar').fill(local.slice(2));
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toBeVisible();
    await page.getByLabel('Buscar').fill('');
    await page.getByLabel('Tipo de contato').selectOption('patient');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toHaveCount(0);
  });

  test('S07-H1 edit kind, see consents and conversations, anonymize (LGPD)', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/contatos/${world.contactId}`);
    await expect(page.getByText('Aviso de privacidade · versão 2026-10')).toBeVisible();
    await expect(
      page.getByRole('link').filter({ hasText: 'Pelo número +55 11 4000-0099' }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel('Tipo').selectOption('staff');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(formStatus(page)).toHaveText('Contato atualizado.');

    expect(await mediaExists(world.imagePath)).toBe(true);
    await page.getByRole('button', { name: 'Anonimizar contato' }).click();
    // The confirmation checkbox is required.
    await expect(page.getByText('Anonimizar contato', { exact: true }).first()).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Anonimizar contato' }).click();
    await expect(
      page
        .getByRole('main')
        .getByText('Dados pessoais removidos. 1 arquivo(s) de mídia apagado(s).'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contato anonimizado' })).toBeVisible();
    await expect(page.getByText(contactName)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
    expect(await mediaExists(world.imagePath)).toBe(false);
    const [row] = await sql<{ text: string | null; transcription: string | null }>(
      `select string_agg(text, '') as text, string_agg(transcription, '') as transcription
         from messages where conversation_id = $1`,
      [world.conversationId],
    );
    expect(row).toEqual({ text: null, transcription: null });

    await page.goto(`/t/${TENANT_LOG.slug}/conversas`);
    await expect(page.getByText(contactName)).toHaveCount(0);
  });

  test('S07-N1 a viewer sees the contact without edit or anonymize', async ({ page }) => {
    const viewer = await createMember(TENANT_LOG.id, 'viewer');
    try {
      await login(page, viewer.email, viewer.password);
      await page.goto(`/t/${TENANT_LOG.slug}/contatos`);
      await expect(page.getByRole('button', { name: 'Cadastrar contato' })).toHaveCount(0);
      await page.goto(`/t/${TENANT_LOG.slug}/contatos/00000000-0000-4000-8000-0000000000e1`);
      await expect(page.getByRole('heading', { name: 'João Motorista' })).toBeVisible();
      await expect(page.getByText('Tipo: Motorista')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Anonimizar contato' })).toHaveCount(0);
    } finally {
      await deleteUser(viewer.id);
    }
  });
});

test('S05-M1 @mobile a conversation fits a phone screen', async ({ page }) => {
  await login(page, DEMO.owner);
  await page.goto(`/t/${TENANT_LOG.slug}/conversas/00000000-0000-4000-8000-0000000000c1`);
  await expect(page.getByText('O termômetro do baú está marcando seis graus.')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page);
});
