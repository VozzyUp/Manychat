import { expect, test } from '@playwright/test';
import {
  createMember,
  DEMO,
  deleteUser,
  expectAccessible,
  formAlert,
  formStatus,
  login,
  sql,
  TENANT_LOG,
} from './helpers';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('S19 general settings and white-label', () => {
  test.beforeEach(async () => {
    await sql(`update tenants set branding = '{}' where id = $1`, [TENANT_LOG.id]);
  });
  test.afterAll(async () => {
    await sql(`update tenants set branding = '{}', name = 'Transportadora Demo' where id = $1`, [
      TENANT_LOG.id,
    ]);
  });

  test('S19-H1 a new brand colour re-skins the panel', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config`);
    await expectAccessible(page);
    await page.getByLabel('Cor principal', { exact: true }).fill('#7c3aed');
    await page.getByLabel('Nome exibido no painel').fill('Transportes Roxo');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(formStatus(page)).toHaveText('Configurações salvas.');

    const header = page.locator('header');
    await expect(header.getByText('Transportes Roxo')).toBeVisible();
    const accent = await page.locator('div[style*="--nh-accent"]').first().getAttribute('style');
    expect(accent).toMatch(/--nh-accent:\s*#7c3aed/);
  });

  test('S19-N1 an invalid colour is refused with a clear message', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config`);
    await page.getByLabel('Cor principal', { exact: true }).evaluate((el: HTMLInputElement) => {
      el.removeAttribute('pattern');
      el.value = 'roxo';
    });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(formAlert(page)).toContainText('Cor inválida');
  });

  test('S19-H2 upload and remove the logo', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config`);
    await page
      .getByLabel(/Novo logo/)
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.getByRole('button', { name: 'Enviar logo' }).click();
    await expect(formStatus(page)).toHaveText('Logo atualizado.');
    await expect(page.getByRole('img', { name: 'Logo atual' })).toBeVisible();
    await page.getByRole('button', { name: 'Remover logo' }).click();
    await expect(page.getByText('Sem logo')).toBeVisible();
  });

  test('S19-E1 viewers see the settings read-only', async ({ page }) => {
    await login(page, DEMO.viewer);
    await page.goto(`/t/${TENANT_LOG.slug}/config`);
    await expect(page.getByText('Só administradores alteram estas configurações')).toBeVisible();
    await expect(page.getByLabel('Nome da empresa')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
  });
});

test.describe('S20 team', () => {
  test('S20-H1 change a role and remove a member', async ({ page }) => {
    const member = await createMember(TENANT_LOG.id, 'viewer');
    try {
      await login(page, DEMO.owner);
      await page.goto(`/t/${TENANT_LOG.slug}/config/membros`);
      await expectAccessible(page);
      const row = page.getByRole('listitem').filter({ hasText: member.email });
      await row.getByLabel(/Papel de/).selectOption('quality');
      await row.getByRole('button', { name: 'Salvar' }).click();
      await expect(row.getByRole('status')).toHaveText('Papel atualizado.');

      page.once('dialog', (dialog) => void dialog.accept());
      await row.getByRole('button', { name: 'Remover' }).click();
      await expect(page.getByText(member.email)).toHaveCount(0);
    } finally {
      await deleteUser(member.id);
    }
  });

  test('S20-N1 the last owner cannot be demoted', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config/membros`);
    const row = page.getByRole('listitem').filter({ hasText: DEMO.owner });
    await row.getByLabel(/Papel de/).selectOption('admin');
    await row.getByRole('button', { name: 'Salvar' }).click();
    await expect(row.getByRole('alert')).toContainText('pelo menos um responsável');
  });
});

test.describe('S23 modules and departments', () => {
  test('S23-H1 add, rename and delete a department', async ({ page }) => {
    const name = `Setor ${Date.now()}`;
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config/modulos`);
    await expect(page.getByText('Ativo').first()).toBeVisible();
    await page.getByLabel('Novo setor').fill(name);
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await expect(formStatus(page)).toHaveText('Setor criado.');

    const row = page.getByRole('listitem').filter({ has: page.locator(`input[value="${name}"]`) });
    await row.getByLabel('Nome do setor').fill(`${name} (renomeado)`);
    await row.getByRole('button', { name: 'Renomear' }).click();
    await expect(page.locator(`input[value="${name} (renomeado)"]`)).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('listitem')
      .filter({ has: page.locator(`input[value="${name} (renomeado)"]`) })
      .getByRole('button', { name: 'Excluir' })
      .click();
    await expect(page.locator(`input[value="${name} (renomeado)"]`)).toHaveCount(0);
  });
});

test.describe('mobile', () => {
  test('S03-M1 @mobile the menu opens on a phone', async ({ page }) => {
    await login(page, DEMO.viewer);
    await expect(page.getByRole('heading', { name: TENANT_LOG.name })).toBeVisible();
    await page.locator('summary', { hasText: 'Abrir menu' }).click();
    await expect(page.getByRole('link', { name: 'Configurações' }).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
