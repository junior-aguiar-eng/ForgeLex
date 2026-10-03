import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const number = '0000001-77.2025.8.02.0001';
const result = {
  court: 'TJAL', processNumber: '00000017720258020001', billable: false,
  consultedAt: '2026-10-03T12:00:00.000Z', source: { name: 'CNJ / DataJud', url: 'https://www.cnj.jus.br/sistemas/datajud/api-publica/' },
  notice: 'Os registros podem estar incompletos ou desatualizados.', truncated: false,
  records: [{ id: 'TJAL_fixture', court: 'TJAL', processNumber: '00000017720258020001', degree: 'G1',
    filedAt: '20250101000000', caseClass: { codigo: 7, nome: 'Procedimento Comum Cível' }, subjects: [{ codigo: 1, nome: 'Assunto fictício' }],
    judgingBody: { codigo: 1, nome: 'Vara fictícia' }, sourceUpdatedAt: '2025-02-03T12:00:00.000Z', indexedAt: '2025-02-04T12:00:00.000Z',
    movements: [{ code: 2, name: 'Conclusão fictícia', occurredAt: '2025-02-01T12:00:00.000Z' }],
  }],
};

test('visitante consulta por teclado sem conta, credencial ou débito', async ({ page }) => {
  let calls = 0;
  const financial: string[] = [];
  page.on('request', (request) => { if (/\/api\/v2\/(billing|research)\//.test(request.url())) financial.push(request.url()); });
  await page.route('**/api/v2/datajud/tjal/process', async (route) => {
    calls++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ processNumber: number });
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers()['idempotency-key']).toBeUndefined();
    await route.fulfill({ json: result });
  });
  await page.goto('/consulta-processual');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consulta processual do TJAL');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://nexojuris.ia.br/consulta-processual');
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  await page.getByLabel('Número do processo', { exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Conclusão fictícia');
  await expect(page.getByRole('heading', { level: 3, name: /Procedimento Comum Cível/ })).toBeVisible();
  await expect(page.getByText('Vara fictícia', { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('CNJ / DataJud');
  expect(calls).toBe(1);
  expect(financial).toEqual([]);
});

test('cliques e Enter durante a espera executam uma consulta e preservam a identificação do resultado', async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v2/datajud/tjal/process', async (route) => { calls++; await gate; await route.fulfill({ json: result }); });
  await page.goto('/consulta-processual');
  const field = page.getByLabel('Número do processo', { exact: true });
  await field.fill(number);
  try {
    await field.press('Enter');
    await expect(page.getByRole('button', { name: 'Consultando…' })).toBeDisabled();
    await field.press('Enter');
    await field.press('Enter');
  } finally { release(); }
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toBeVisible();
  expect(calls).toBe(1);
  await field.fill('0000002-62.2025.8.02.0001');
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText(number);
  expect(calls).toBe(1);
});

test('falha e resultado vazio têm mensagens distintas e nenhum pedido para recarregar créditos', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v2/datajud/tjal/process', async (route) => {
    calls++;
    await route.fulfill(calls === 1
      ? { status: 504, json: { error: 'DATAJUD_TIMEOUT', message: 'O DataJud demorou a responder. Tente novamente mais tarde; esta consulta é gratuita.' } }
      : { json: { ...result, records: [] } });
  });
  await page.goto('/consulta-processual');
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('demorou');
  await expect(page.getByRole('link', { name: 'Recarregar créditos' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Nenhum registro retornado');
  await expect(page.getByRole('main')).toContainText('não comprova');
});

test('entrada incompleta não dispara chamada e a consulta não fica na URL ou no armazenamento local', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v2/datajud/tjal/process', async (route) => { calls++; await route.fulfill({ json: result }); });
  await page.goto('/consulta-processual');
  await page.getByLabel('Número do processo', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  expect(calls).toBe(0);
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toBeVisible();
  expect(page.url()).not.toContain('0000001');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('0000001');
});

test('resultados extensos e entradas de graus distintos são acessíveis e responsivos', async ({ page }) => {
  const fixture = { ...result, truncated: true, records: [result.records[0], { ...result.records[0], id: 'TJAL_G2_fixture', degree: 'G2',
    judgingBody: { codigo: 2, nome: 'Órgão julgador com nome longo para validar a quebra de linha em telas pequenas' },
    movements: [{ code: 3, name: 'Movimentação fictícia de segundo grau', occurredAt: '2025-02-02T12:00:00.000Z' }],
  }] };
  await page.route('**/api/v2/datajud/tjal/process', async (route) => route.fulfill({ json: fixture }));
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/consulta-processual');
    await page.getByLabel('Número do processo', { exact: true }).fill(number);
    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Movimentação fictícia de segundo grau');
    await expect(page.getByRole('main')).toContainText('mais registros');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    if (process.env.FORGELEX_E2E_DATAJUD_SCREENSHOTS && (width === 375 || width === 1440)) {
      await page.screenshot({ path: `temp/datajud-publication/ui-${width}.png`, fullPage: true });
    }
  }
});
