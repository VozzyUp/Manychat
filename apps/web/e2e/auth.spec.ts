import { expect, test } from '@playwright/test';
import {
  createMember,
  DEMO,
  formAlert,
  formStatus,
  deleteUser,
  expectAccessible,
  lastEmailTo,
  login,
  sql,
  submitLogin,
  TENANT_LAB,
  TENANT_LOG,
  totp,
  watchConsole,
} from './helpers';

test.describe('F02 login and tenant switching', () => {
  test('F02-H1 user with two tenants picks one and sees the branded shell', async ({ page }) => {
    const errors = watchConsole(page);
    await login(page, DEMO.owner);
    await expect(page).toHaveURL(/\/tenants$/);
    await expect(page.getByRole('heading', { name: 'Escolha a empresa' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('link', { name: /Transportadora Demo/ }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}$`));
    await expect(page.getByRole('heading', { name: TENANT_LOG.name })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    await expect(page.getByText('Nurion Log', { exact: true })).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test('F02-N1 wrong password shows an error and keeps the user out', async ({ page }) => {
    await submitLogin(page, DEMO.owner, 'senha-errada-123');
    await expect(formAlert(page)).toHaveText('E-mail ou senha incorretos.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('F02-E1 a deep link survives the login', async ({ page }) => {
    await page.goto(`/t/${TENANT_LOG.slug}/config/modulos`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('E-mail').fill(DEMO.owner);
    await page.getByLabel('Senha', { exact: true }).fill('NurionDemo!2026');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}/config/modulos$`));
    await expect(page.getByRole('heading', { name: 'Setores' })).toBeVisible();
  });

  test('F02-H2 the switcher moves between tenants', async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}`);
    await page.getByLabel('Trocar de empresa').selectOption(TENANT_LAB.slug);
    await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LAB.slug}$`));
    await expect(page.getByRole('heading', { name: TENANT_LAB.name })).toBeVisible();
  });

  test('F02-E2 a tenant I do not belong to is a 404, not a leak', async ({ page }) => {
    await login(page, DEMO.viewer);
    await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}$`));
    await page.goto(`/t/${TENANT_LAB.slug}`);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });

  test('F02-H3 sign out ends the session', async ({ page }) => {
    await login(page, DEMO.viewer);
    await page.getByText(DEMO.viewer).click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto(`/t/${TENANT_LOG.slug}`);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe('F02 password and invites', () => {
  test('F02-H4 forgot password: e-mail link → new password → signed in', async ({ page }) => {
    const user = await createMember(TENANT_LOG.id, 'viewer');
    try {
      await page.goto('/esqueci-senha');
      await page.getByLabel('E-mail').fill(user.email);
      await page.getByRole('button', { name: 'Enviar link' }).click();
      await expect(formStatus(page)).toContainText('Se esse e-mail tiver acesso');

      const mail = await lastEmailTo(user.email);
      expect(mail.subject).toBe('Criar uma nova senha no Nurion Hub');
      const link = /href="([^"]+auth\/confirm[^"]+)"/.exec(mail.html)![1]!.replaceAll('&amp;', '&');
      await page.goto(link);
      await expect(page).toHaveURL(/\/definir-senha$/);
      await page.getByLabel('Nova senha').fill('semnumerosaqui');
      await page.getByLabel('Repita a senha').fill('semnumerosaqui');
      await page.getByRole('button', { name: 'Salvar senha' }).click();
      await expect(formAlert(page)).toContainText('letras e números');
      await page.getByLabel('Nova senha').fill('NovaSenha-2026');
      await page.getByLabel('Repita a senha').fill('NovaSenha-2026');
      await page.getByRole('button', { name: 'Salvar senha' }).click();
      await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}$`));
    } finally {
      await deleteUser(user.id);
    }
  });

  test('F01-H2 an invited person creates a password and lands in the tenant', async ({
    page,
    browser,
  }) => {
    const email = `convite-${Date.now()}@test.local`;
    await login(page, DEMO.owner);
    await page.goto(`/t/${TENANT_LOG.slug}/config/membros`);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Papel', { exact: true }).selectOption('operator');
    await page.getByRole('button', { name: 'Convidar' }).click();
    await expect(formStatus(page)).toHaveText('Convite enviado por e-mail.');
    await expect(page.getByText(email)).toBeVisible();

    const mail = await lastEmailTo(email);
    expect(mail.subject).toBe('Seu acesso ao Nurion Hub');
    const link = /href="([^"]+auth\/confirm[^"]+)"/.exec(mail.html)![1]!.replaceAll('&amp;', '&');
    const invitee = await (await browser.newContext()).newPage();
    try {
      await invitee.goto(link);
      await expect(invitee).toHaveURL(/\/definir-senha$/);
      await invitee.getByLabel('Nova senha').fill('Convidado-2026');
      await invitee.getByLabel('Repita a senha').fill('Convidado-2026');
      await invitee.getByRole('button', { name: 'Salvar senha' }).click();
      await expect(invitee).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}$`));
    } finally {
      await sql(`delete from auth.users where email = $1`, [email]);
    }
  });
});

test.describe('F02 two-factor authentication', () => {
  test('F02-H5 enable 2FA, then the next login asks for the code', async ({ page }) => {
    const user = await createMember(TENANT_LOG.id, 'admin');
    try {
      await login(page, user.email, user.password);
      await page.goto(`/conta/seguranca`);
      await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
      await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
      await expectAccessible(page);
      const secret = (await page.locator('code').innerText()).trim();
      await page.getByLabel('Código').fill(totp(secret));
      await page.getByRole('button', { name: 'Ativar', exact: true }).click();
      await expect(page.getByText('A verificação em duas etapas está ativa')).toBeVisible();

      await page.context().clearCookies();
      await login(page, user.email, user.password);
      await expect(page).toHaveURL(/\/login\/2fa/);
      await page.getByLabel('Código do aplicativo autenticador').fill('000000');
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(formAlert(page)).toContainText('Código inválido');
      await page.getByLabel('Código do aplicativo autenticador').fill(totp(secret));
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(page).toHaveURL(new RegExp(`/t/${TENANT_LOG.slug}$`));

      // A password-only session cannot skip the second step by typing a URL.
      await page.context().clearCookies();
      await login(page, user.email, user.password);
      await page.goto(`/t/${TENANT_LOG.slug}/config`);
      await expect(page).toHaveURL(/\/login\/2fa/);
    } finally {
      await deleteUser(user.id);
    }
  });
});
