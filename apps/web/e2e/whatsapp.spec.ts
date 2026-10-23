import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEMO, expectAccessible, formAlert, login, sql, TENANT_LOG } from './helpers';

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

test.describe('S21 WhatsApp numbers and S22 templates', () => {
  const phone = digits(15);
  test.afterAll(async () => {
    await sql(`delete from whatsapp_templates where tenant_id = $1`, [TENANT_LOG.id]);
    await sql(`delete from whatsapp_numbers where phone_number_id = $1`, [phone]);
  });

  test('S21-N1 a token Meta rejects is refused', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config/whatsapp`);
    await page.getByLabel('Phone number ID').fill(digits(15));
    await page.getByLabel('WhatsApp Business Account ID').fill('102290129340398');
    await page.getByLabel('Token de acesso permanente').fill('EAAG-revoked-000000000000000');
    await page.getByRole('button', { name: 'Conectar número' }).click();
    await expect(formAlert(page)).toContainText('Meta');
  });

  test('S21-H1 connect a number, test it, disable it; S22-H1 sync templates', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config/whatsapp`);
    await expectAccessible(page);
    await page.getByLabel('Phone number ID').fill(phone);
    await page.getByLabel('WhatsApp Business Account ID').fill('102290129340398');
    await page.getByLabel('Token de acesso permanente').fill('EAAG-valid-token-abcdef123456');
    await page.getByLabel('Módulo padrão do número').selectOption('log');
    await page.getByRole('button', { name: 'Conectar número' }).click();

    const row = page.getByRole('listitem').filter({ hasText: `ID ${phone}` });
    await expect(row).toContainText('Empresa Demo');
    await expect(row).toContainText('token ••••3456');
    await expect(row).toContainText('Módulo padrão: Nurion Log');
    await expect(page.getByText('EAAG-valid-token-abcdef123456')).toHaveCount(0);

    await row.getByRole('button', { name: 'Testar conexão' }).click();
    await expect(row.getByRole('status')).toHaveText('Conexão com a Meta confirmada.');
    await row.getByRole('button', { name: 'Desativar' }).click();
    await expect(row.getByText('Desativado')).toBeVisible();
    await row.getByRole('button', { name: 'Reativar' }).click();
    await expect(row.getByText('Ativo', { exact: true })).toBeVisible();

    await page.goto(`/t/${TENANT_LOG.slug}/config/templates`);
    await page.getByRole('button', { name: 'Sincronizar com a Meta' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      '1 template(s) sincronizado(s)',
    );
    const template = page.getByRole('listitem').filter({ hasText: 'alerta_temperatura' });
    await expect(template.getByText('Aprovado')).toBeVisible();
    await expect(template).toContainText('3 variável(is)');
    await expectAccessible(page);
  });
});
