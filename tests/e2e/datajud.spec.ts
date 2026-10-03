import { expect, test, type Page } from '@playwright/test';
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

// Autenticação e todas as APIs são fictícias, inclusive ao testar os assets publicados.
async function mockWorkspace(page: Page) {
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'datajud@forgelex.test', aud: 'authenticated', role: 'authenticated',
    app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Conta fictícia DataJud' }, created_at: '2026-01-01T00:00:00Z' };
  const now = Math.floor(Date.now() / 1000);
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: now + 3600, iat: now })).toString('base64url')}.fixture`;
  const state = { calls: 0, paid: 0, logout: 0, identity: 0 };
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('/token?grant_type=password')) {
      await route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'fixture-refresh', user } });
    } else if (route.request().url().includes('/user')) await route.fulfill({ json: user });
    else { state.logout++; await route.fulfill({ status: 400, json: { message: 'Unexpected fixture auth request' } }); }
  });
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v2/datajud/tjal/process') {
      state.calls++;
      expect(request.headers().authorization).toBeUndefined();
      expect(request.headers()['idempotency-key']).toBeUndefined();
      await route.fulfill({ json: result });
    } else if (path === '/api/v2/auth/me') {
      state.identity++;
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      await route.fulfill({ json: { user: { ...user, displayName: 'Conta fictícia DataJud', status: 'ACTIVE' }, workspace: { id: 'fixture-workspace', name: 'Fictício', status: 'ACTIVE' }, membership: { role: 'OWNER', status: 'ACTIVE' } } });
    } else if (path === '/api/v2/auth/bootstrap') await route.fulfill({ json: {} });
    else if (request.method() !== 'GET') { state.paid++; await route.fulfill({ status: 400, json: { error: 'UNEXPECTED_OPERATION' } }); }
    else await route.fulfill({ json: { tribunals: [], items: [], balanceCents: 1000, searchCostCents: 20 } });
  });
  await page.goto('/entrar');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-ficticia-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return state;
}

test('consulta interna mantém sessão, menu e navegação; acesso direto e recarga conservam o workspace', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockWorkspace(page);
  await page.evaluate(() => Reflect.set(window, '__navigationFixture', 'same-document'));
  const consultation = page.getByRole('button', { name: 'Consulta processual gratuita', exact: true });
  await consultation.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/consulta-processual$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consulta processual');
  await expect(consultation).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Conta fictícia DataJud', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Criar acesso', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__navigationFixture'))).toBe('same-document');
  expect(state.calls).toBe(0);
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Conclusão fictícia');
  await page.screenshot({ path: testInfo.outputPath('workspace-desktop.png'), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consulta processual');
  await page.reload();
  await expect(consultation).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Conta fictícia DataJud', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('ForgeLex · Consulta processual');
  expect(state.calls).toBe(1);
  expect(state.paid).toBe(0);
  expect(state.logout).toBe(0);
  expect(state.identity).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('consulta interna mobile fecha o menu e permanece protegida para visitante', async ({ page }, testInfo) => {
  await page.goto('/app/consulta-processual');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mockWorkspace(page);
  await page.getByRole('button', { name: 'Abrir menu lateral', exact: true }).click();
  await page.getByRole('button', { name: 'Consulta processual gratuita', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/consulta-processual$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consulta processual');
  await expect(page.getByRole('button', { name: 'Abrir menu lateral', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Consulta processual gratuita', exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.calls).toBe(0);
  expect(state.paid).toBe(0);
  expect(state.logout).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('workspace-mobile.png'), fullPage: true });
});

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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Consulta processual');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://nexojuris.ia.br/consulta-processual');
  const court = page.getByRole('combobox', { name: 'Tribunal', exact: true });
  await expect(court).toHaveValue('tjal');
  await expect(court.getByRole('option')).toHaveText(['TJAL — Alagoas']);
  await court.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Número do processo', { exact: true })).toBeFocused();
  expect(calls).toBe(0);
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  await page.getByLabel('Número do processo', { exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Conclusão fictícia');
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('TJAL');
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
    await expect(page.getByRole('combobox', { name: 'Tribunal', exact: true })).toBeDisabled();
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

test('espera uma fonte que demora mais de 60 segundos e mostra movimento sem código', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/v2/datajud/tjal/process', async (route) => {
    calls++;
    await gate;
    await route.fulfill({ json: { ...result, records: [{ ...result.records[0], movements: [
      { name: 'Descrição não informada', occurredAt: '2025-02-01T12:00:00Z' },
    ] }] } });
  });
  await page.goto('/consulta-processual');
  await page.getByLabel('Número do processo', { exact: true }).fill(number);
  try {
    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await page.clock.fastForward(61000);
    await expect(page.getByRole('button', { name: 'Consultando…' })).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).toContainText('Descrição não informada');
  await expect(page.getByRole('region', { name: 'Resultado da consulta' })).not.toContainText('undefined');
  expect(calls).toBe(1);
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
  for (const width of [375, 768, 1024, 1280, 1440]) {
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
