import { expect, test } from '@playwright/test';

test('percorre cobrança comercial real com transporte sintético e preserva idempotência', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('comercial@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Organizar o relato sintético para conferência.');
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
  await expect(page.getByText(/Este trabalho custa até/)).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible({ timeout: 60000 });
  const receipt = page.getByText('Comprovante do trabalho', { exact: true }).locator('..');
  await page.getByText('Comprovante do trabalho', { exact: true }).click();
  await expect(receipt).toContainText('0,50');
  await expect(receipt).toContainText('4,50');
  const id = new URL(page.url()).searchParams.get('executionId');
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const before = await (
    await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`, { headers })
  ).json();
  expect(before).toMatchObject({
    status: 'COMPLETED',
    currency: 'BRL',
    reservedCents: 500,
    chargedCents: 50,
    releasedCents: 450,
  });
  const quote = await (
    await page.request.get('http://127.0.0.1:3301/api/agentic/commercial/quote', { headers })
  ).json();
  expect(quote.availableCents).toBe(450);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  const after = await (
    await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`, { headers })
  ).json();
  expect(after).toMatchObject({ chargedCents: 50, releasedCents: 450 });
  const other = await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`);
  expect(other.status()).toBe(401);
});
