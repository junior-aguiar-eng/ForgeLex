import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const searchUrl = '**/api/v2/research/search-case-law';
test('salva no caso sem nova cobrança, deduplica e mantém a fonte para reutilização', async ({ page, request, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const title = `Caso de pesquisa ${Date.now()}`;
  const matter = await (await request.post('http://127.0.0.1:3341/api/v2/matters', { headers, data: { title } })).json();
  await login(page);
  await page.goto('/app/pesquisa');
  await page.getByPlaceholder('Tema, tese ou número do processo').fill('vazamento');
  const response = page.waitForResponse(r => r.url().endsWith('/research/search-case-law') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  const source = (await (await response).json()).results[0];
  const afterSearch = await balance(page);
  const result = page.getByRole('article').filter({ hasText: source.processNumber }).first();
  await result.getByRole('button', { name: 'Salvar no caso', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Salvar julgado no caso' });
  await expect(dialog.getByRole('button', { name: 'Salvar julgado', exact: true })).toBeDisabled();
  await dialog.getByLabel('Caso de destino').selectOption(matter.id);
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('save-case-mobile.png') });
  await dialog.getByRole('button', { name: 'Salvar julgado', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Julgado salvo');
  await dialog.getByRole('button', { name: 'Salvar julgado', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('já está salvo');
  expect(await balance(page)).toBe(afterSearch);
  const saved = await (await request.get(`http://127.0.0.1:3341/api/v2/matters/${matter.id}/authorities`, { headers })).json();
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0].authority).toEqual(source);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByPlaceholder('Tema, tese ou número do processo')).toHaveValue('vazamento');
  await page.goto(`/app/casos?caso=${matter.id}`);
  const collection = page.getByRole('region', { name: 'Julgados do caso' });
  await expect(collection.getByText(source.processNumber, { exact: true })).toBeVisible();
  await collection.getByRole('button', { name: 'Copiar Citação', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(source.syllabus);
  expect(await balance(page)).toBe(afterSearch);
  await page.goto('/app/rascunhos');
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByLabel('Julgado da tese').getByRole('option', { name: new RegExp(source.processNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('value', saved.items[0].id);
});

test('falha ao salvar preserva seleção e pesquisa quando o caso é arquivado', async ({ page, request }) => {
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const title = `Caso arquivado após seleção ${Date.now()}`;
  const matter = await (await request.post('http://127.0.0.1:3341/api/v2/matters', { headers, data: { title } })).json();
  await login(page);
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar no caso', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Caso de destino').selectOption(matter.id);
  await request.post(`http://127.0.0.1:3341/api/v2/matters/${matter.id}/archive`, { headers, data: { expectedLifecycleRevision: 0 } });
  const before = await balance(page);
  await dialog.getByRole('button', { name: 'Salvar julgado', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Caso indisponível para edição');
  await expect(dialog.getByLabel('Caso de destino')).toHaveValue(matter.id);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Termo de pesquisa' })).toHaveValue('vazamento');
  expect(await balance(page)).toBe(before);
});
test('timeout permite repetir a mesma operação e não oferece recarga de créditos', async ({ page }) => {
  await login(page);
  const before = await balance(page);
  const keys: string[] = [];
  await page.route(searchUrl, async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) await route.fulfill({ status: 504, json: { error: 'TOOL_TIMEOUT', message: 'A operação excedeu o tempo de resposta. Tente novamente.' } });
    else await route.continue();
  });
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2023');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('excedeu o tempo');
  await expect(page.getByRole('button', { name: 'Recarregar créditos', exact: true })).toHaveCount(0);
  expect(await balance(page)).toBe(before);
  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(await balance(page)).toBe(before - 20);
});
async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('pesquisa@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}
async function balance(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const raw = Object.entries(localStorage).find(([key]) => key.includes('auth-token'))?.[1];
    const token = raw ? JSON.parse(raw).access_token : '';
    const response = await fetch('http://127.0.0.1:3341/api/v2/billing/account', { headers: { authorization: `Bearer ${token}` } });
    return (await response.json()).balanceCents;
  });
}

test('histórico e exemplos não cobram; cliques rápidos geram uma operação; cópia e detalhes são gratuitos', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('/research/search-case-law')) requests.push(request.headers()['idempotency-key']); });
  const before = await balance(page);
  await expect(page.getByText(/Tarifa por nova pesquisa: R\$\s*0,20/)).toBeVisible();
  await page.getByRole('button', { name: 'Capitalização CCB' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2023');
  await page.getByRole('button', { name: 'Consultar', exact: true }).evaluate((element) => { element.click(); element.click(); element.click(); });
  const history = page.getByRole('button', { name: /Recuperar consulta: vazamento.*2023/ }).first();
  await expect(history).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(await balance(page)).toBe(before - 20);
  await page.getByRole('button', { name: 'Ver Detalhes' }).first().click();
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await page.getByRole('button', { name: 'Copiar Citação' }).first().click();
  await expect(page.getByRole('button', { name: 'Copiado!' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Ementa:');
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2022');
  await history.click();
  await expect(page.getByLabel('Ano do julgamento', { exact: true })).toHaveValue('2023');
  await expect(page.getByText('Consulta exibida: vazamento · STJ · 2023')).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(history).toContainText('2 consultas');
  expect(requests).toHaveLength(2);
  expect(await balance(page)).toBe(before - 40);
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('denied'); } }); });
  await page.getByRole('button', { name: /Copiar Citação|Copiado!/ }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível copiar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiado!' })).toHaveCount(0);
  expect(requests).toHaveLength(2);
});

test('ano e cópia funcionam também na tela de pesquisa', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await page.getByPlaceholder('Tema, tese ou número do processo').fill('vazamento');
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2022');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText(/não localizou resultados/i)).toBeVisible();
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2023');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiar Citação' })).toBeVisible();
  await expect(page.getByText('Consulta exibida: vazamento · STJ · 2023')).toBeVisible();
});

test('Enter repetido durante a busca executa uma única operação', async ({ page }) => {
  await login(page);
  const before = await balance(page);
  let release!: () => void;
  let dispatched!: () => void;
  const started = new Promise<void>((resolve) => { dispatched = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route(searchUrl, async (route) => {
    requests++;
    const response = await route.fetch();
    dispatched();
    await gate;
    await route.fulfill({ response });
  });
  const input = page.getByRole('textbox', { name: 'Termo de pesquisa' });
  await input.fill('vazamento');
  await input.press('Enter');
  await started;
  await input.press('Enter');
  await input.press('Enter');
  release();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  expect(await balance(page)).toBe(before - 20);
});

test('navegar durante perda da resposta conserva filtros e chave na outra tela', async ({ page }) => {
  await login(page);
  const before = await balance(page);
  let release!: () => void;
  let dispatched!: () => void;
  const started = new Promise<void>((resolve) => { dispatched = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const keys: string[] = [];
  await page.route(searchUrl, async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (keys.length === 1) { dispatched(); await gate; await route.abort('failed'); }
    else await route.fulfill({ response });
  });
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByLabel('Ano do julgamento', { exact: true }).selectOption('2023');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await started;
  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  release();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByPlaceholder('Tema, tese ou número do processo')).toHaveValue('vazamento');
  await expect(page.getByLabel('Ano do julgamento', { exact: true })).toHaveValue('2023');
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(await balance(page)).toBe(before - 20);
});

test('controles em mobile não causam rolagem horizontal', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByLabel('Ano do julgamento', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('encerrar a sessão limpa resultados mantidos em memória', async ({ page }) => {
  await login(page);
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await page.getByLabel('E-mail').fill('pesquisa@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeVisible();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toHaveCount(0);
});

test('resposta perdida repete a mesma chave sem novo débito; nova consulta usa outra chave', async ({ page }) => {
  await login(page);
  const before = await balance(page);
  const keys: string[] = [];
  let loseResponse = true;
  await page.route(searchUrl, async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (loseResponse) { loseResponse = false; await route.abort('failed'); }
    else await route.fulfill({ response });
  });
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(await balance(page)).toBe(before - 20);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect.poll(() => keys.length).toBe(3);
  expect(keys[2]).not.toBe(keys[0]);
  await expect.poll(() => balance(page)).toBe(before - 40);
});
