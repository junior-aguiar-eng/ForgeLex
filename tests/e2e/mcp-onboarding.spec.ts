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
  await expect(page.getByRole('heading', { name: 'API para desenvolvedores' })).toBeVisible();

  await page.goto('/guia/mcp');
  await expect(page).toHaveURL(/\/guia\/mcp$/);
  await expect(page.getByRole('heading', { name: 'Guia de conexão para advogados' })).toBeVisible();
  await expect(page.getByText('Como revogar', { exact: true })).toBeVisible();

  await page.goto('/conta/atividade');
  await expect(page).toHaveURL(/\/conta\/atividade$/);
  await expect(page.getByRole('heading', { name: 'Atividade da conta' })).toBeVisible();
  await expect(page.getByText('Nenhuma operação faturável nos últimos 30 dias')).toBeVisible();

  await page.goto('/conta/seguranca');
  await expect(page).toHaveURL(/\/conta\/seguranca$/);
  await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();
  await expect(page.getByText('Encerramento ainda indisponível')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitação indisponível' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Solicitar encerramento' })).toHaveCount(0);
});

test('cria e revoga uma chave sintética sem reapresentar o segredo', async ({ page }) => {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conta/chaves');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Chaves de API' })).toBeVisible();
  await page.getByLabel('Nome da chave').fill('E2E pesquisa');
  await page.getByText('API de pesquisa', { exact: true }).click();
  await page.getByRole('button', { name: 'Criar chave', exact: true }).click();

  const secret = await page.locator('code').textContent();
  expect(secret).toMatch(/^flx_live_/);
  await expect(page.getByText('Copie agora: o segredo não será exibido novamente')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revogar', exact: true }).click();
  await expect(page.getByText('Revogada', { exact: true })).toBeVisible();

  const revokedStatus = await page.evaluate(async (token) => {
    const response = await fetch('http://127.0.0.1:3001/api/v2/api-keys', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status;
  }, secret!);
  expect(revokedStatus).toBe(401);

  await page.reload();
  await expect(page.getByText('Copie agora: o segredo não será exibido novamente')).toHaveCount(0);
  await expect(page.getByText(secret!, { exact: true })).toHaveCount(0);
});

test('a seleção de host permanece operável por teclado em viewport móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  const claude = page.getByRole('button', { name: 'Mostrar instruções para Claude', exact: true });
  await claude.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/conectar$/);
  await expect(claude).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Preparar o Claude' })).toBeVisible();
  await expect(page.getByText('Não configurado', { exact: true }).first()).toBeVisible();

  await page.goto('/guia/mcp');
  await expect(page.getByRole('heading', { name: 'Guia de conexão para advogados' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para a conta' })).toBeVisible();
});

test('menu móvel fechado não recebe foco fora da tela', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  const menu = page.getByRole('button', { name: 'Abrir menu lateral' });
  await menu.focus();
  await page.keyboard.press('Tab');
  expect(await page.locator('#forgelex-sidebar').evaluate((sidebar) => sidebar.contains(document.activeElement)))
    .toBe(false);
});

test('ações principais da conexão têm alvos móveis perceptíveis', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  for (const name of ['Abrir menu lateral', 'Copiar URL MCP', 'Testar disponibilidade']) {
    const button = page.getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    expect(box?.width, `${name}: largura`).toBeGreaterThanOrEqual(44);
    expect(box?.height, `${name}: altura`).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  const closeMenu = await page.locator('#forgelex-sidebar')
    .getByRole('button', { name: 'Fechar menu lateral' }).boundingBox();
  expect(closeMenu?.width, 'Fechar menu lateral: largura').toBeGreaterThanOrEqual(44);
  expect(closeMenu?.height, 'Fechar menu lateral: altura').toBeGreaterThanOrEqual(44);
  const affordance = await page.getByRole('button', { name: 'Testar disponibilidade', exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || Number.parseFloat(style.borderTopWidth) > 0;
    });
  expect(affordance).toBe(true);
});

test('URL local é apresentada como prévia e não pode ser copiada para um host remoto', async ({ page }) => {
  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await expect(page.getByText(/Esta URL é local e não pode ser usada pelo ChatGPT ou Claude/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiar URL MCP' })).toBeDisabled();
  await expect(page.getByText(/Copie o endereço e use-o somente/)).toHaveCount(0);
});

test('documentação da API mantém contraste de texto nos exemplos', async ({ page }) => {
  await page.goto('/desenvolvedores/api');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'API para desenvolvedores' })).toBeVisible();

  const inactive = page.getByRole('button', { name: 'Node.js', exact: true });
  const color = await inactive.evaluate((element) => getComputedStyle(element).color);
  expect(color).not.toBe('rgb(120, 113, 108)');
  const hint = page.getByText('Escolha “Exibir exemplo de resposta”. O conteúdo será identificado como demonstração.');
  expect(await hint.evaluate((element) => getComputedStyle(element).color)).not.toBe('rgb(168, 162, 158)');
});

test('conta não promete validade ou meios de pagamento não confirmados', async ({ page }) => {
  await page.goto('/conta');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recarregar créditos' })).toBeVisible();
  await expect(page.getByText('O saldo não vence.')).toHaveCount(0);
  await expect(page.getByText('Cartão ou Pix', { exact: true })).toHaveCount(0);
});

test('saldo zero disponível mantém preço da API e não simula billing desabilitado', async ({ page }) => {
  await page.route('**/api/v2/billing/account', async (route) => {
    const response = await route.fetch();
    const account = await response.json();
    await route.fulfill({ response, body: JSON.stringify({
      ...account,
      balanceCents: 0,
      paidBalanceCents: 0,
      promotionalBalanceCents: 0,
    }) });
  });
  await page.goto('/conta');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recarregar créditos' })).toBeVisible();
  await expect(page.getByText('R$ 0,00', { exact: true })).toBeVisible();
  await expect(page.getByText('R$ 0,20 por busca jurisprudencial')).toBeVisible();
  await expect(page.getByText('Créditos indisponíveis neste ambiente')).toHaveCount(0);
});

test('URL remota retornada pela API libera a ação de copiar sem afirmar conexão', async ({ page }) => {
  await page.route('**/api/v2/mcp/connection-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      serviceAvailable: true,
      mcpUrl: 'https://mcp.forgelex.example/mcp',
      authenticatedCredential: true,
      scopes: ['mcp'],
      lastMcpUseAt: null,
      billableOperationExecuted: false,
    }),
  }));
  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Testar disponibilidade' }).click();
  await expect(page.getByRole('button', { name: 'Copiar URL MCP' })).toBeEnabled();
  await expect(page.getByText(/Esta URL é local e não pode ser usada pelo ChatGPT ou Claude/)).toHaveCount(0);
  await expect(page.getByText('Conectado', { exact: true })).toHaveCount(0);
});

test('guia mantém um único conteúdo principal e ações móveis com 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/guia/mcp');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guia de conexão para advogados' })).toBeVisible();

  await expect(page.locator('main')).toHaveCount(1);
  for (const name of ['Ir para a conta', 'Gerenciar chaves de API']) {
    const box = await page.getByRole('link', { name }).boundingBox();
    expect(box?.height, `${name}: altura`).toBeGreaterThanOrEqual(44);
  }
});

test('guia apresenta o preço recebido da conta sem valor fixo próprio', async ({ page }) => {
  await page.route('**/api/v2/billing/account', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ searchCostCents: 37 }),
  }));
  await page.goto('/guia/mcp');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guia de conexão para advogados' })).toBeVisible();
  await expect(page.getByText('R$ 0,37 por pesquisa jurisprudencial')).toBeVisible();
});

test('Escape fecha o menu móvel e devolve foco ao botão de abertura', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  await page.locator('#forgelex-sidebar').getByRole('button', { name: 'Fechar menu lateral' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu lateral' })).toBeFocused();
});

test('billing desabilitado não é apresentado como saldo zero ou falha genérica', async ({ page }) => {
  await page.route('**/api/v2/billing/**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'BILLING_UNAVAILABLE', message: 'Billing não configurado.' }),
  }));
  await page.goto('/conta');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Créditos indisponíveis neste ambiente' })).toBeVisible();
  await expect(page.getByText(/O faturamento não está habilitado neste ambiente/)).toBeVisible();
  await expect(page.getByText('R$ 0,00', { exact: true })).toHaveCount(0);
  await page.goto('/conta/atividade');
  await expect(page.getByRole('heading', { name: 'Atividade financeira indisponível neste ambiente' })).toBeVisible();
  await expect(page.getByText('R$ 0,00', { exact: true })).toHaveCount(0);
});

test('queda do billing após carga anterior não mantém saldo antigo como atual', async ({ page }) => {
  let unavailable = false;
  await page.route('**/api/v2/billing/**', (route) => unavailable
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'BILLING_UNAVAILABLE', message: 'Billing não configurado.' }) })
    : route.continue());

  await page.goto('/conta');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recarregar créditos' })).toBeVisible();
  unavailable = true;
  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos indisponíveis neste ambiente' })).toBeVisible();
  await expect(page.getByText('Saldo atual')).toHaveCount(0);

  unavailable = false;
  await page.goto('/conta/atividade');
  await expect(page.getByRole('heading', { name: 'Atividade da conta' })).toBeVisible();
  unavailable = true;
  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Atividade financeira indisponível neste ambiente' })).toBeVisible();
  await expect(page.getByText('Saldo atual')).toHaveCount(0);
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
