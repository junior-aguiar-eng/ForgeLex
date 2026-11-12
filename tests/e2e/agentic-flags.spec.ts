import { expect, test } from '@playwright/test';

// A Mesa é uma só e exige a Mesa agêntica e os casos ligados. Com os casos ocultos o app não mostra Mesa nem expõe
// rota ou identificadores de caso.
test('com casos ocultos não há Mesa e as rotas de caso voltam para a conexão', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await expect(page.getByRole('button', { name: 'Mesa', exact: true })).toHaveCount(0);
  await page.goto('/app/trabalho');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveCount(0);
  await page.goto('/app/rascunhos?matterId=synthetic');
  await expect(page).toHaveURL(/\/app\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Rascunho do caso', exact: true })).toHaveCount(0);
});
