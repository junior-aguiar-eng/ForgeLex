import { expect, test } from '@playwright/test';

test('rotas do onboarding persistem em recarregamento e nos botões de histórico', async ({ page }) => {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.getByRole('button', { name: 'Usar no ChatGPT ou Claude', exact: true }).click();
  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await expect(page).toHaveURL(/\/pesquisa$/);
  await expect(page.getByPlaceholder('Tema, tese ou número do processo')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.goto('/desenvolvedores/api');
  await expect(page).toHaveURL(/\/desenvolvedores\/api$/);
  await expect(page.getByRole('heading', { name: 'Documentação da API' })).toBeVisible();
});

test('a seleção de host permanece operável por teclado em viewport móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  const claude = page.getByRole('button', { name: 'Ver instruções para Claude', exact: true });
  await claude.focus();
  await page.keyboard.press('Enter');

  await expect(claude).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Preparar o Claude' })).toBeVisible();
  await expect(page.getByText('Não configurado', { exact: true }).first()).toBeVisible();
});

test('teste gratuito de disponibilidade separa serviço, credencial e uso sem consultar saldo', async ({ page }) => {
  let billingRequested = false;
  await page.route('**/api/v2/billing/account', (route) => {
    billingRequested = true;
    return route.abort();
  });
  await page.route('**/api/v2/mcp/connection-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      serviceAvailable: true,
      mcpUrl: 'https://mcp.forgelex.ai',
      authenticatedCredential: true,
      scopes: ['mcp'],
      lastMcpUseAt: null,
      billableOperationExecuted: false,
    }),
  }));
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  await page.getByRole('button', { name: 'Testar disponibilidade', exact: true }).click();
  await expect(page.getByText('Serviço disponível', { exact: true })).toBeVisible();
  await expect(page.getByText('Credencial pronta', { exact: true })).toBeVisible();
  await expect(page.getByText('Uso confirmado ainda não registrado', { exact: true })).toBeVisible();
  await expect(page.getByText(/Nenhuma pesquisa jurídica, saldo ou crédito é consultado neste teste\./)).toBeVisible();
  expect(billingRequested).toBe(false);
});

for (const scenario of [
  { name: 'credencial ausente', status: 401, code: 'UNAUTHENTICATED', message: 'A credencial está ausente, expirada ou revogada.' },
  { name: 'credencial revogada', status: 401, code: 'CREDENTIAL_REVOKED', message: 'A credencial está ausente, expirada ou revogada.' },
  { name: 'escopo MCP insuficiente', status: 403, code: 'INSUFFICIENT_SCOPE', message: 'A credencial não possui o escopo MCP necessário.' },
  { name: 'indisponibilidade temporária', status: 503, code: 'API_UNAVAILABLE', message: 'O ForgeLex está temporariamente indisponível. Tente novamente em alguns instantes.' },
]) {
  test(`teste gratuito informa ${scenario.name}`, async ({ page }) => {
    await page.route('**/api/v2/mcp/connection-status', (route) => route.fulfill({
      status: scenario.status,
      contentType: 'application/json',
      body: JSON.stringify({ error: scenario.code, message: 'Resposta de teste.' }),
    }));
    const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

    await page.goto('/conectar');
    await page.getByLabel('E-mail').fill('fase7@forgelex.test');
    await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    expect((await bootstrap).status()).toBe(200);

    await page.getByRole('button', { name: 'Testar disponibilidade', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(scenario.message);
  });
}
