import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const api = 'http://127.0.0.1:3551';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
async function login(page: Page) {
  await page.goto('/entrar'); await page.getByLabel('E-mail').fill('salvas@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-local-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL('**/app');
}
async function search(page: Page, query = 'vazamento') {
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill(query);
  const completed = page.waitForResponse(response => response.url().endsWith('/research/search-case-law') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click(); expect((await completed).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Leitor de decisões' }).first()).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  const { items } = await (await request.get(api + '/api/v2/research/saved', { headers })).json();
  for (const item of items) expect((await request.delete(api + '/api/v2/research/saved/' + item.id, { headers })).status()).toBe(204);
});
test('six manual saves, full collection, cancel and failed deletion preserve the current result and balance', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 }); await login(page);
  const panel = page.getByRole('region', { name: 'Pesquisas salvas', exact: true });
  for (let i = 1; i <= 6; i++) { await search(page); await panel.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click(); await expect(panel.getByRole('heading', { name: `Pesquisas salvas — ${i} de 6` })).toBeVisible(); }
  await search(page);
  const balance = (await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents;
  await expect(panel.getByText('Você já tem 6 pesquisas salvas. Exclua uma para salvar esta.')).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click(); await expect(panel.getByRole('alert')).toContainText('Você já tem 6 pesquisas salvas');
  const selected = panel.getByRole('button', { name: 'Excluir', exact: true }).first(); await selected.click();
  const confirm = page.getByRole('dialog', { name: 'Excluir pesquisa salva' }); await expect(confirm).toContainText('vazamento'); await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(panel.getByRole('heading', { name: 'Pesquisas salvas — 6 de 6' })).toBeVisible();
  await selected.click();
  await page.route('**/api/v2/research/saved/*', async route => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE', message: 'A exclusão não pôde ser concluída.' } }) : route.continue());
  await confirm.getByRole('button', { name: 'Excluir pesquisa', exact: true }).click(); await expect(panel.getByRole('alert')).toContainText('A exclusão não pôde'); await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await page.unroute('**/api/v2/research/saved/*'); await selected.click(); await confirm.getByRole('button', { name: 'Excluir pesquisa', exact: true }).click(); await expect(panel.getByRole('heading', { name: 'Pesquisas salvas — 5 de 6' })).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click(); await expect(panel.getByRole('heading', { name: 'Pesquisas salvas — 6 de 6' })).toBeVisible();
  expect((await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents).toBe(balance);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('six-saved-mobile.png'), fullPage: true });
});
test('opening and copying are free, new research is charged, results survive navigation and another device', async ({ page, request, browser }, testInfo) => {
  await login(page); await search(page, 'civil');
  const reader = page.getByRole('region', { name: 'Leitor de decisões' }).first();
  await expect(reader.getByText('ForgeLex', { exact: true })).toBeVisible();
  await expect(reader.getByRole('tab', { name: 'Ementa', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(reader.getByRole('tabpanel', { name: 'Ementa', exact: true })).toBeVisible();
  await expect(reader.getByRole('tab', { name: 'Resultado do julgamento', exact: true })).toHaveCount(0);
  const next = reader.getByRole('button', { name: 'Próxima decisão' });
  await next.focus(); await page.keyboard.press('ArrowRight'); await expect(reader.getByText(/^2 de /)).toBeVisible(); await page.keyboard.press('ArrowLeft'); await expect(reader.getByText(/^1 de /)).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('copy blocked'); } } }); });
  await reader.getByRole('button', { name: 'Copiar citação' }).click(); await expect(reader.getByRole('textbox', { name: 'Citação para copiar manualmente' })).toBeVisible();
  await reader.getByText('Origem e fonte', { exact: true }).click(); await expect(reader.getByText('Link da fonte não disponível.')).toBeVisible(); await expect(reader.getByRole('link', { name: 'Conferir decisão', exact: true })).toHaveCount(0);
  const panel = page.getByRole('region', { name: 'Pesquisas salvas', exact: true }); await panel.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click(); await expect(panel.getByRole('heading', { name: 'Pesquisas salvas — 1 de 6' })).toBeVisible();
  const balance = (await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents;
  let searches = 0; page.on('request', req => { if (req.url().endsWith('/research/search-case-law')) searches++; });
  await page.reload(); await panel.getByRole('button', { name: 'Abrir', exact: true }).click(); await expect(panel.getByText(/Resultados da pesquisa realizada em/)).toBeVisible(); expect(searches).toBe(0);
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); await login(other); await other.getByRole('region', { name: 'Pesquisas salvas', exact: true }).getByRole('button', { name: 'Abrir', exact: true }).click(); await expect(other.getByText(/Resultados da pesquisa realizada em/)).toBeVisible(); await otherContext.close();
  const violations = (await new AxeBuilder({ page }).include('.decision-reader').analyze()).violations; expect(violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: testInfo.outputPath('saved-reader-dark.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Pesquisar novamente', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Pesquisar novamente' }); await expect(dialog).toContainText('cobrada normalmente'); await dialog.getByRole('button', { name: 'Cancelar' }).click(); expect(searches).toBe(0);
  await panel.getByRole('button', { name: 'Pesquisar novamente', exact: true }).click(); await dialog.getByRole('button', { name: 'Executar nova pesquisa' }).click(); await expect(dialog).toHaveCount(0); expect(searches).toBe(1);
  expect((await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents).toBe(balance - 20);
});
test('saved research date and time use the same local calendar day', async ({ page }) => {
  await login(page); await search(page, 'civil');
  const panel = page.getByRole('region', { name: 'Pesquisas salvas', exact: true });
  await panel.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Pesquisas salvas — 1 de 6' })).toBeVisible();
  await page.route('**/api/v2/research/saved/*', async route => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ response, json: { ...result, searchedAt: '2026-10-11T00:30:00.000Z' } });
  });
  await panel.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(panel.getByText('Resultados da pesquisa realizada em 10/10/2026 às 21:30:00. O material conservado não foi atualizado.')).toBeVisible();
});

test('new saved permission starts unchecked and remains revocable without granting case access', async ({ page }, testInfo) => {
  await login(page); await page.goto('/app/conectar');
  const permissions = page.getByRole('region', { name: 'Permissão para pesquisas salvas' });
  const checkbox = permissions.getByRole('checkbox', { name: 'Minha conexão de teste — Gerenciar pesquisas salvas' }); await expect(checkbox).not.toBeChecked(); await checkbox.click(); await expect(checkbox).toBeChecked(); await page.reload(); await expect(checkbox).toBeChecked(); await checkbox.click(); await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Casos', exact: true })).toHaveCount(0); await page.screenshot({ path: testInfo.outputPath('saved-permission.png'), fullPage: true });
});

test('official MCP Apps bridge renders the isolated resource and saves the complete search from a selected decision', async ({ page, request }, testInfo) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const token = state.oauthTokens['app-one'];
  expect((await request.put(api + '/api/v2/research/saved/permissions', { headers, data: { clientId: 'app-one', grantedAt: '2026-10-05T10:00:00.000Z', enabled: true } })).status()).toBe(200);
  const operationId = 'mcp-reader-' + Date.now();
  const original = await (await request.post(api + '/api/v2/research/search-case-law', { headers: { ...headers, 'Idempotency-Key': operationId }, data: { query: 'civil', court: 'STJ', limit: 20 } })).json();
  expect(original.results).toHaveLength(2);
  const rpc = async (method: string, params: any) => {
    const result = await (await request.post(api + '/mcp', { headers: { authorization: 'Bearer ' + token }, data: { jsonrpc: '2.0', id: 1, method, params } })).json();
    expect(result.error).toBeUndefined(); return result.result;
  };
  const input = { operationId, items: [{ recordId: original.results[0].id, versionId: original.results[0].versionId }] };
  const result = await rpc('tools/call', { name: 'research.present_decisions', arguments: input });
  expect(result.isError).not.toBe(true); expect(result.structuredContent.decisions).toHaveLength(1);
  // Exercise untrusted UI text and link opening without fetching a real tribunal.
  // Save must still recover the original complete operation, never this presentation.
  const testSource = 'https://example.test/decisao-de-demonstracao';
  result.structuredContent.decisions[0].decision.fullTextUrl = testSource;
  result.structuredContent.decisions[0].decision.syllabus += '\n<script>window.injected = true</script>';
  const resource = await rpc('resources/read', { uri: 'ui://forgelex/decisions/v1' });
  const html = resource.contents[0].text;
  expect(html).not.toContain(token); expect(html).toContain("connect-src 'none'");
  const taskRequire = createRequire(resolve('apps/web/node_modules/vite/package.json'));
  const { build } = taskRequire('esbuild');
  const bundle = await build({ entryPoints: [resolve('tests/fixtures/mcp-reader-host.ts')], bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
  await page.route('**/mcp-reader-preview', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><title>Teste local MCP Apps</title><body></body></html>' }));
  // The test host forwards requests outside the isolated frame, using the
  // synthetic connection held by Node. No credentials enter the browser content.
  await page.route('**/mcp-test-proxy', async route => {
    const response = await request.post(api + '/mcp', { headers: { authorization: 'Bearer ' + token }, data: route.request().postDataJSON() });
    await route.fulfill({ status: response.status(), contentType: 'application/json', body: await response.text() });
  });
  await page.goto('/mcp-reader-preview');
  await page.evaluate(fixture => { (window as any).fixture = fixture; }, { html, result, input });
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0].text });
  const reader = page.frameLocator('iframe');
  await expect(reader.getByText('ForgeLex', { exact: true })).toBeVisible();
  await expect(reader.getByRole('tab', { name: 'Ementa', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(reader.getByRole('heading', { name: original.results[0].processNumber })).toBeVisible();
  await expect(reader.getByText(/<script>window.injected = true<\/script>/)).toBeVisible();
  expect(await page.locator('iframe').contentFrame().locator('body').evaluate(() => (window as any).injected)).toBeUndefined();
  await reader.getByText('Origem e fonte', { exact: true }).click();
  await reader.getByRole('link', { name: 'Conferir decisão', exact: true }).click(); await expect(page.locator('body')).toHaveAttribute('data-opened-source', testSource);
  await page.evaluate(() => { document.body.dataset.failOpen = 'true'; });
  await reader.getByRole('link', { name: 'Conferir decisão', exact: true }).click(); await expect(reader.getByRole('textbox', { name: 'Endereço da fonte para copiar' })).toHaveValue(testSource);
  await reader.getByRole('button', { name: 'Expandir', exact: true }).click(); await expect(page.locator('body')).toHaveAttribute('data-mode', 'fullscreen');
  const balance = (await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents;
  await reader.getByRole('button', { name: 'Salvar pesquisa', exact: true }).click(); await expect(reader.getByRole('status')).toHaveText('Pesquisa completa salva.');
  await expect(reader.getByRole('button', { name: 'Pesquisas salvas — 1 de 6' })).toBeVisible();
  const contrast = await reader.locator('.mcp-note').first().evaluate(element => {
    const luminance = (color: string) => { const rgb = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }); return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; };
    const background = getComputedStyle(document.body).backgroundColor;
    const a = luminance(getComputedStyle(element).color); const b = luminance(background === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await reader.getByRole('button', { name: 'Abrir', exact: true }).click(); await expect(reader.getByText('1 de 2', { exact: true })).toBeVisible();
  await expect(reader.getByText(/<script>window.injected = true<\/script>/)).toHaveCount(0);
  await reader.getByRole('button', { name: 'Próxima decisão' }).focus(); await page.keyboard.press('ArrowRight'); await expect(reader.getByText('2 de 2', { exact: true })).toBeVisible();
  await reader.getByRole('button', { name: 'Excluir', exact: true }).click(); await reader.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(reader.getByRole('button', { name: 'Pesquisas salvas — 1 de 6' })).toBeVisible();
  expect((await (await request.get(api + '/api/v2/billing/account', { headers })).json()).balanceCents).toBe(balance);
  await page.screenshot({ path: testInfo.outputPath('mcp-apps-local-reader.png'), fullPage: true });
  await reader.getByRole('button', { name: 'Excluir', exact: true }).click(); await reader.getByRole('button', { name: 'Excluir pesquisa', exact: true }).click(); await expect(reader.getByRole('button', { name: 'Pesquisas salvas — 0 de 6' })).toBeVisible(); await expect(reader.getByText('Nenhuma pesquisa aberta. Abra outra pesquisa salva quando quiser.')).toBeVisible();
});
