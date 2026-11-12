import { expect, test, type Page } from '@playwright/test';

// `playwright.desk-shell.config.ts` liga a nova casca (VITE_FORGELEX_DESK_SHELL) e define esta variável; as demais
// configurações rodam este arquivo com a casca desligada, que é o padrão de produção.
const shell = process.env.FORGELEX_E2E_DESK_SHELL === 'true';

async function openDesk(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
}

test(
  shell
    ? 'a nova casca mostra os atalhos do estado vazio e cada um leva a algo que a Mesa já faz'
    : 'sem a nova casca o estado vazio não tem atalhos',
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDesk(page);
    const shortcuts = page.getByRole('region', { name: 'Atalhos', exact: true });
    if (!shell) {
      await expect(shortcuts).toHaveCount(0);
      return;
    }
    await expect(shortcuts.getByRole('button')).toHaveText([
      /Nova peça/,
      /Revisar um texto/,
      /Pesquisar jurisprudência/,
    ]);
    // Celular: os atalhos ficam em coluna única e não criam rolagem horizontal.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(shortcuts).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mesa-vazia-celular.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath('mesa-vazia-desktop.png') });
    // Revisar um texto começa o pedido no compositor, sem enviar nada.
    await shortcuts.getByRole('button', { name: /Revisar um texto/ }).click();
    await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(
      'Preciso revisar este texto: ',
    );
    // Pesquisar abre a pesquisa e as fontes.
    await shortcuts.getByRole('button', { name: /Pesquisar jurisprudência/ }).click();
    await expect(page.getByRole('dialog', { name: 'Pesquisa e fontes' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Nova peça abre a peça ao lado da conversa.
    await shortcuts.getByRole('button', { name: /Nova peça/ }).click();
    await expect(page.getByRole('region', { name: 'Mesa da peça' })).toBeVisible();
  },
);
