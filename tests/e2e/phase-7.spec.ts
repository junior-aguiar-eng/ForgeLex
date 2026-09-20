import { expect, test } from '@playwright/test';

test('Fase 7: login, pesquisa, verificação, billing e revisão operam com fixtures locais', async ({ page }) => {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');
  await page.goto('/');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const bootstrapResponse = await bootstrap;
  expect(bootstrapResponse.status(), await bootstrapResponse.text()).toBe(200);
  const tribunalRequest = page.waitForResponse((response) => response.url().includes('/api/v2/tribunals'));
  await page.reload();
  const tribunalResponse = await tribunalRequest;
  expect(tribunalResponse.status(), await tribunalResponse.text()).toBe(200);
  await expect(page.getByText('Operação Fase 7')).toBeVisible();
  await expect(page.locator('select').first().locator('option')).toHaveText(['STJ']);

  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  const courts = page.locator('select').first();
  await expect(courts.locator('option')).toHaveCount(1);
  await expect(courts.locator('option')).toHaveText(['STJ']);

  await page.getByPlaceholder('Tema, tese ou número do processo').fill('vazamento');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText('REsp 1.823.450/SP')).toBeVisible();
  await expect(page.getByText(/cobrança de R\$ 0,20/i)).toBeVisible();

  await page.getByPlaceholder('Tema, tese ou número do processo').fill('expressão inexistente');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText(/não localizou resultados/i)).toBeVisible();

  await page.getByLabel('Número do processo').fill('REsp 1.823.450/SP');
  await page.getByRole('button', { name: /Verificar gratuitamente/i }).click();
  await expect(page.getByText('Verificado na fonte oficial')).toBeVisible();

  const purchase = await page.evaluate(async () => {
    const sessionRaw = Object.entries(localStorage).find(([key]) => key.includes('auth-token'))?.[1];
    const accessToken = sessionRaw ? JSON.parse(sessionRaw).access_token : '';
    const response = await fetch('http://127.0.0.1:3001/api/v2/billing/checkout', {
      method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ packageId: 'credits_25' }),
    });
    return response.json();
  });
  expect(purchase.status).toBe('PENDING');
  await page.request.post(`http://127.0.0.1:3001/e2e/confirm-purchase/${purchase.purchaseId}`);
  const confirmed = await page.evaluate(async (purchaseId) => {
    const sessionRaw = Object.entries(localStorage).find(([key]) => key.includes('auth-token'))?.[1];
    const accessToken = sessionRaw ? JSON.parse(sessionRaw).access_token : '';
    return fetch(`http://127.0.0.1:3001/api/v2/billing/purchases/${purchaseId}`, { headers: { authorization: `Bearer ${accessToken}` } }).then((response) => response.json());
  }, purchase.purchaseId);
  expect(confirmed.status).toBe('PAID');

  await page.getByRole('button', { name: 'Revisão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Memo prescricional' })).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Revisão aprovada no fluxo interno.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Memo prescricional' })).toHaveCount(0);
});
