import { expect, test } from '@playwright/test';

test('menu em tela baixa permite alcançar e abrir a consulta gratuita', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 568 });
  await page.goto('/app/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  const navigation = page.locator('#forgelex-sidebar nav');
  const consultation = navigation.getByRole('button', { name: 'Consulta processual gratuita' });
  await consultation.scrollIntoViewIfNeeded();
  expect(await navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const bounds = await consultation.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
  await consultation.click();
  await expect(page).toHaveURL(/\/app\/consulta-processual$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
