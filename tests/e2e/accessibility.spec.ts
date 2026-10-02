import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page, testInfo: TestInfo): Promise<void> {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  await writeFile(testInfo.outputPath('wcag.json'), JSON.stringify(result, null, 2));
  await testInfo.attach('wcag-2.1-aa', {
    body: JSON.stringify(
      {
        url: result.url,
        timestamp: result.timestamp,
        engine: result.testEngine,
        violations: result.violations,
        incomplete: result.incomplete,
        passedRules: result.passes.map((rule) => rule.id),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(
    result.violations.map((rule) => ({
      id: rule.id,
      impact: rule.impact,
      targets: rule.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  const spacing = await page.addStyleTag({
    content:
      '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
  });
  await testInfo.attach('text-spacing-overflow', {
    body: JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            text: element.textContent?.slice(0, 120),
            right: element.getBoundingClientRect().right,
          })),
      ),
    ),
    contentType: 'application/json',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'reflow com espaçamento WCAG 1.4.12',
  ).toBe(true);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('text-spacing.png') });
  await testInfo.attach('text-spacing', { path: testInfo.outputPath('text-spacing.png'), contentType: 'image/png' });
  await spacing.evaluate((element) => element.remove());
}

const publicRoutes = [
  '/',
  '/produto',
  '/como-funciona',
  '/integracoes',
  '/creditos',
  '/guia',
  '/desenvolvedores/api',
  '/entrar',
  '/cadastro',
];
const workspaceRoutes = [
  '/app',
  '/pesquisa',
  '/casos',
  '/rascunhos',
  '/revisao',
  '/conta',
  '/conectar',
  '/conta/seguranca',
];

for (const width of [1366, 320]) {
  test.describe(`WCAG 2.1 AA em ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const path of publicRoutes) {
      test(`público ${path}`, async ({ page }, testInfo) => {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        await audit(page, testInfo);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
    for (const path of workspaceRoutes) {
      test(`autenticado ${path}`, async ({ page }, testInfo) => {
        await page.goto('/entrar');
        await page.getByLabel('E-mail', { exact: true }).fill('fase7@forgelex.test');
        await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await page.waitForURL('**/app');
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        await audit(page, testInfo);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
    test('rascunho com caso e seções carregados', async ({ page }, testInfo) => {
      await page.goto('/entrar');
      await page.getByLabel('E-mail', { exact: true }).fill('fase7@forgelex.test');
      await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.waitForURL('**/app');
      await page.goto('/rascunhos');
      await page.getByText('Detalhes técnicos', { exact: true }).click();
      await page.getByRole('button', { name: 'Atualizar casos', exact: true }).click();
      await expect(page.getByPlaceholder('Título do rascunho')).toBeVisible();
      await audit(page, testInfo);
    });
    test('revisão modal mantém foco, nome e saída por Escape', async ({ page }, testInfo) => {
      await page.goto('/entrar');
      await page.getByLabel('E-mail', { exact: true }).fill('fase7@forgelex.test');
      await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.waitForURL('**/app');
      await page.goto('/revisao');
      const trigger = page.getByRole('button', { name: 'Revisar item', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Memo prescricional', exact: true });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      for (let index = 0; index < 6; index += 1) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      for (let index = 0; index < 6; index += 1) {
        await page.keyboard.press('Shift+Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      await audit(page, testInfo);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}
