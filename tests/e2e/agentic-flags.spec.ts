import { expect, test } from '@playwright/test';

test('trabalho ativo não expõe rota ou identificadores de caso quando casos estão ocultos', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  await page.getByRole('button', { name: 'Criar uma peça', exact: true }).click();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Preparar minuta sintética');
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
  await page.getByLabel('Contexto escrito').fill('Contexto sintético para elaborar uma minuta.');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar minuta', exact: true })).toHaveCount(0);
  await page.goto('/app/rascunhos?matterId=synthetic');
  await expect(page).toHaveURL(/\/app\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Rascunho do caso', exact: true })).toHaveCount(0);
});
