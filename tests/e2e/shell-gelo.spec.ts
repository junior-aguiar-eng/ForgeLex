import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Tema gelo com a regra do mínimo (AGENTS.md, 26/11/2026): a Mesa é a conversa; fora dela, só Conectar IA e Conta.
// `playwright.shell-gelo.config.ts` sobe o app com VITE_FORGELEX_THEME=gelo.

async function login(page: Page, email = 'casca@forgelex.test') {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/app(\/trabalho)?$/);
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
}

const sidebar = (page: Page) => page.locator('#forgelex-sidebar');
const folder = (page: Page) => sidebar(page).getByRole('region', { name: 'Pasta' });
const composer = (page: Page) => page.getByLabel('O que você precisa fazer?', { exact: true });
const scan = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const api = 'http://127.0.0.1:3301';
const apiHeaders = { authorization: 'Bearer phase7-e2e-access-token' };
const unique = (prefix: string) => `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function createCase(page: Page, title: string) {
  await folder(page).getByRole('button', { name: 'Novo caso' }).click();
  await folder(page).getByLabel('Nome do caso').fill(title);
  await folder(page).getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(folder(page).getByRole('button', { name: title, exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(`No caso: ${title}`)).toBeVisible();
}

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page).toHaveURL(/executionId=/);
  await expect(page.getByText(/Trabalho concluído/)).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).searchParams.get('executionId')!;
}

const accountButton = (page: Page) => sidebar(page).getByRole('button', { name: /^Conta de / });

test('a lateral tem Nova conversa, Pasta e Recentes; Conectar IA, Conta e Sair ficam no menu da conta', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page).toHaveURL(/\/app\/trabalho$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gelo');
  const aside = sidebar(page);
  // Logo novo (27/11): o desenho aprovado, em tamanho de cabeçalho (nem miniatura, nem gigante).
  const logo = aside.locator('img[src="/brand/forgelex-logo.svg"]');
  await expect(logo).toBeVisible();
  const logoBox = (await logo.boundingBox())!;
  expect(logoBox.height).toBeGreaterThanOrEqual(26);
  expect(logoBox.height).toBeLessThanOrEqual(36);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/forgelex-simbolo.svg');
  await expect(aside.getByRole('button', { name: 'Nova conversa' })).toBeVisible();
  await expect(folder(page)).toBeVisible();
  await expect(aside.getByText('Recentes', { exact: true })).toBeVisible();
  await expect(aside.getByRole('navigation', { name: 'Conta e recursos' })).toHaveCount(0);
  await expect(aside.getByRole('button', { name: 'Recolher menu lateral' })).toHaveCount(0);
  const account = accountButton(page);
  await expect(account).toContainText(/Saldo R\$/);
  // Recarregar continua a um clique, ao lado do saldo, como antes do menu da conta.
  await expect(aside.getByRole('button', { name: 'Recarregar', exact: true })).toBeVisible();
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await account.click();
  // Disclosure (não é role=menu): o painel vem depois do botão, e Tab percorre os itens na ordem.
  await expect(aside.getByRole('menu')).toHaveCount(0);
  const panel = aside.getByRole('group', { name: 'Conta' });
  await expect(panel.getByRole('button')).toHaveText(['Conectar IA', 'Conta e créditos', 'Sair']);
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Conectar IA' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(account).toBeFocused();
  await account.click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(panel).toHaveCount(0);
  await aside.getByRole('button', { name: 'Recarregar', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conta$/);
  await expect(aside.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0);
  await account.click();
  await panel.getByRole('button', { name: 'Conectar IA' }).click();
  await expect(page).toHaveURL(/\/app\/conectar$/);
  for (const removed of [
    'Mesa',
    'Casos',
    'Visão geral',
    'Jurisprudência',
    'Andamento processual',
    'Rascunhos',
    'Revisão',
  ])
    await expect(aside.getByRole('button', { name: removed, exact: true })).toHaveCount(0);
  for (const label of ['Trabalho', 'Conta e recursos'])
    await expect(aside.getByText(label, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('banner')).toBeHidden();
});

test('os caminhos das telas removidas abrem a Mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  for (const path of [
    '/app',
    '/app/casos',
    '/app/casos?caso=qualquer',
    '/app/pesquisa',
    '/app/consulta-processual',
    '/app/andamento-processual',
    '/app/rascunhos',
    '/app/revisao',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/app\/trabalho/);
    await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  }
  // O logotipo também leva à Mesa, inclusive a partir da Conta.
  await accountButton(page).click();
  await sidebar(page).getByRole('button', { name: 'Conta e créditos', exact: true }).click();
  await sidebar(page).getByRole('button', { name: 'ForgeLex, ir para o início' }).click();
  await expect(page).toHaveURL(/\/app\/trabalho/);
  // O site público de consulta processual não muda.
  await page.goto('/consulta-processual');
  await expect(page).toHaveURL(/\/consulta-processual$/);
});

test('o pedido é só texto, anexo e Enviar; a barra de cima só tem a peça', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const box = page.getByRole('region', { name: 'Novo pedido', exact: true });
  await expect(box.getByRole('textbox')).toHaveCount(1);
  // O clipe de anexo depende de VITE_FORGELEX_ATTACHMENTS_ENABLED, ligado em produção e desligado nesta configuração.
  await expect(box.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  for (const removed of [/^Vincular a um caso/, /Me ajude a começar/, /Adicionar matéria/, /Gerenciar casos/])
    await expect(page.getByRole('button', { name: removed })).toHaveCount(0);
  await expect(page.getByLabel('Opção do pedido')).toHaveCount(0);
  await expect(page.getByLabel('Caso', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Comece por um exemplo' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Dois selos, dois sentidos' })).toHaveCount(0);
  for (const removed of ['Pendências de revisão', 'Pesquisa e fontes'])
    await expect(page.getByRole('button', { name: removed })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova peça' })).toBeVisible();

  // O pedido vai como o usuário escreveu, sem ação nem caso.
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  const text = 'Pesquise no STJ teses sobre desconto indevido em benefício.';
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.objective).toBe(text);
  expect(sent.actionId).toBeUndefined();
  expect(sent.matterId).toBeUndefined();
});

test('a peça é só texto, Salvar e Exportar; salvar sem caso cria o caso na Pasta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'pecaminima@forgelex.test');
  await page.getByRole('button', { name: 'Nova peça' }).click();
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(piece).toBeVisible();
  await expect(piece.getByRole('tablist')).toHaveCount(0);
  await expect(piece.getByText('Abrir peça', { exact: true })).toHaveCount(0);
  await expect(piece.getByRole('button', { name: 'Histórico da peça' })).toHaveCount(0);
  await expect(piece.getByLabel('Caso da peça')).toHaveCount(0);
  await expect(piece.getByLabel('Exportar peça')).toBeVisible();

  const title = unique('Peça mínima');
  await piece.getByLabel('Título da peça').fill(title);
  await piece.getByLabel('Texto da seção 1').fill('Texto sintético da peça.');
  await piece.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(piece.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect(page).toHaveURL(/matterId=.*draftId=/);
  await expect(folder(page).getByRole('button', { name: title, exact: true })).toBeVisible();
});

test('Pasta: o caso criado recebe o pedido, guarda a conversa fora de Recentes, renomeia e sai com ×', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'pasta@forgelex.test');
  await expect(folder(page)).toContainText('/20');
  const title = unique('Caso da Pasta');
  await createCase(page, title);

  const pedido = `Analise o caso ${title}`;
  await send(page, pedido);
  await expect(folder(page).getByRole('button', { name: title, exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(folder(page).getByRole('button', { name: pedido })).toBeVisible();
  await expect(sidebar(page).getByRole('list', { name: 'Recentes' }).getByText(pedido)).toHaveCount(0);

  const renamed = `${title} renomeado`;
  await folder(page).getByRole('button', { name: 'Renomear', exact: true }).click();
  await folder(page).getByLabel('Novo nome do caso').fill(renamed);
  await folder(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(folder(page).getByRole('button', { name: renamed, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Nova conversa' }).first().click();
  await expect(page.getByText(`No caso: ${renamed}`)).toBeVisible();
  await page.getByRole('button', { name: 'Sair do caso' }).click();
  await expect(page.getByText(/^No caso:/)).toHaveCount(0);
  await expect(folder(page).getByRole('button', { name: renamed, exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('Pasta: excluir pede confirmação, nada sai antes dela e o pedido de exclusão leva o nome do caso', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'pastaexcluir@forgelex.test');
  const title = unique('Caso para excluir');
  await createCase(page, title);
  await folder(page).getByRole('button', { name: 'Excluir', exact: true }).click();
  const confirm = folder(page).getByRole('alertdialog', { name: `Excluir ${title}` });
  await expect(confirm).toContainText('Não dá para desfazer');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(folder(page).getByRole('button', { name: title, exact: true })).toBeVisible();

  await folder(page).getByRole('button', { name: 'Excluir', exact: true }).click();
  const trash = page.waitForRequest((request) => /\/api\/v2\/matters\/[^/]+\/trash$/.test(request.url()));
  const purge = page.waitForRequest((request) => /\/api\/v2\/matters\/[^/]+\/purge$/.test(request.url()));
  await folder(page).getByRole('button', { name: 'Excluir de vez' }).click();
  await trash;
  expect(JSON.parse((await purge).postData() ?? '{}').confirmation).toBe(title);
  // O caso sai da Pasta. Este ambiente não habilita a exclusão definitiva no servidor ("indisponível"): a Pasta
  // mostra o motivo, e o caso fica na lixeira, fora da lista.
  await expect(folder(page).getByRole('button', { name: title, exact: true })).toHaveCount(0);
  await expect(folder(page).getByRole('alert')).toBeVisible();
  await expect(page.getByText(/^No caso:/)).toHaveCount(0);
});

test('Pasta: a conversa nova de um caso recebe o histórico das conversas anteriores dele', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'historico@forgelex.test');
  const title = unique('Caso do histórico');
  await createCase(page, title);
  await send(page, `Analise os fatos ${title}`);
  await page.getByRole('button', { name: 'Nova conversa' }).first().click();
  await expect(page.getByText(`No caso: ${title}`)).toBeVisible();
  const second = await send(page, `Agora a peça ${title}`);
  const execution = await (
    await page.request.get(`${api}/api/agentic/executions/${second}`, { headers: apiHeaders })
  ).json();
  const delivery = await (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(execution.deliveryIds.at(-1))}`, {
      headers: apiHeaders,
    })
  ).json();
  expect(delivery.delivery.sources.map((source: { id: string }) => source.id)).toEqual(
    expect.arrayContaining([expect.stringMatching(/^case-history:/)]),
  );
});

test('celular: a gaveta tem Pasta e o menu da conta; Escape fecha e devolve o foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const aside = sidebar(page);
  await expect(aside).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Abrir menu lateral' });
  await toggle.click();
  await expect(aside).toBeVisible();
  await expect(folder(page)).toBeVisible();
  await expect(accountButton(page)).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Jurisprudência', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(aside).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menu lateral' })).toBeFocused();
  await toggle.click();
  await accountButton(page).click();
  await aside.getByRole('button', { name: 'Conta e créditos', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conta/);
  await expect(aside).toBeHidden();
});

test('acessibilidade da Mesa mínima: Mesa, Pasta aberta, peça, Conta e gaveta, sem violação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'axeminima@forgelex.test');
  expect((await scan(page)).violations).toEqual([]);
  await createCase(page, unique('Caso acessível'));
  expect((await scan(page)).violations).toEqual([]);
  await page.getByRole('button', { name: 'Nova peça' }).click();
  await expect(page.getByRole('region', { name: 'Mesa da peça' })).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
  await accountButton(page).click();
  expect((await scan(page)).violations).toEqual([]);
  await sidebar(page).getByRole('button', { name: 'Conta e créditos', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  await expect(sidebar(page)).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
});

test('Conta tem Faturamento, Atividade e Segurança; Conectar IA não tem seções; links antigos levam à tela atual', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await accountButton(page).click();
  await sidebar(page).getByRole('button', { name: 'Conta e créditos', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conta$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Seções da conta' });
  await expect(sections.getByRole('button')).toHaveText(['Faturamento', 'Atividade', 'Segurança']);
  await expect(sections.getByRole('button', { name: 'Faturamento' })).toHaveAttribute('aria-current', 'page');
  await sections.getByRole('button', { name: 'Atividade' }).click();
  await expect(page).toHaveURL(/\/app\/conta\/atividade$/);

  await accountButton(page).click();
  await sidebar(page).getByRole('button', { name: 'Conectar IA', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conectar$/);
  await expect(page.getByRole('navigation', { name: 'Seções de Conectar IA' })).toHaveCount(0);

  for (const [from, to] of [
    ['/app/conta/chaves', /\/app\/conta$/],
    ['/app/guia/mcp', /\/app\/conectar$/],
    ['/app/desenvolvedores/api', /\/app\/conectar$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});

test('Entrar: coluna de contexto ao lado do formulário na tela larga; só o formulário no celular', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/entrar');
  const context = page.getByRole('region', { name: 'Sobre o ForgeLex' });
  await expect(context).toBeVisible();
  await expect(context.getByText('Fontes visíveis. Decisões sob controle humano.')).toBeVisible();
  await expect(context.getByText('Pesquisa que dá para conferir')).toBeVisible();
  await expect(context.getByText('Custos visíveis')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  await expect(page.getByRole('region', { name: 'Acesso ao ForgeLex' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(context).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('acessibilidade de Entrar com a coluna de contexto, sem violação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/entrar');
  await expect(page.getByRole('region', { name: 'Sobre o ForgeLex' })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

test('etapas do trabalho: lista ordenada com o estado de cada etapa, sem nome de documento nem identificador', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'etapas@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso das etapas' } })
  ).json();
  const run = await (
    await page.request.post(api + '/api/agentic/executions', {
      headers: { ...apiHeaders, 'Idempotency-Key': `etapas-${matter.id}` },
      data: {
        matterId: matter.id,
        actionId: 'research_question',
        objective: 'Pesquisar para as etapas',
        context: { text: 'Contexto sintético.', origin: 'USER', documents: [] },
      },
    })
  ).json();
  await page.goto(`/app/trabalho?executionId=${run.id}`);
  const stages = page.getByRole('region', { name: 'Etapas do trabalho' });
  await expect(stages).toBeVisible();
  const items = stages.getByRole('listitem');
  await expect(items.first()).toContainText('Pedido recebido');
  await expect(items.first()).toHaveAttribute('data-state', 'done');
  await expect(stages.locator('[data-stage="working"]')).toBeVisible();
  await expect(stages.locator('[data-stage="delivery"]')).toBeVisible();
  // O estado também vai em texto para leitor de tela, não só na cor do ponto.
  await expect(stages.locator('[data-stage="received"]')).toContainText('concluída');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('etapas do trabalho: o erro fica sempre visível, anunciado e marcado na etapa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'erro@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso do erro' } })
  ).json();
  const run = await (
    await page.request.post(api + '/api/agentic/executions', {
      headers: { ...apiHeaders, 'Idempotency-Key': `erro-${matter.id}` },
      data: {
        matterId: matter.id,
        actionId: 'research_question',
        objective: 'Pesquisar para o erro',
        context: { text: 'Contexto sintético.', origin: 'USER', documents: [] },
      },
    })
  ).json();
  const frame = (sequence: number, type: string, event: string, payload: Record<string, unknown>) =>
    `id: ${sequence}\nevent: ${event}\ndata: ${JSON.stringify({ executionId: run.id, sequence, type, payload })}\n\n`;
  await page.route('**/api/agentic/executions/*/events?*', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body:
        frame(1000, 'STATUS', 'status', { status: 'FAILED' }) +
        frame(1001, 'ERROR', 'error', { code: 'EXECUTION_FAILED' }),
    }),
  );
  await page.goto(`/app/trabalho?executionId=${run.id}`);
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Não foi possível concluir o trabalho');
  // O erro também marca a etapa e vai em texto, não só na cor.
  const working = page.getByRole('region', { name: 'Etapas do trabalho' }).locator('[data-stage="working"]');
  await expect(working).toHaveAttribute('data-state', 'error');
  await expect(working).toContainText('com problema');
  // O parágrafo de andamento (região viva) diz o mesmo para leitor de tela.
  await expect(page.getByRole('status', { name: 'Andamento' })).toContainText('Não foi possível concluir o trabalho');
});

test('Conta: a coluna lateral mostra identificação, atividade e encerramento, sem chaves de API; o preço não fala em buscas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'conta@forgelex.test');
  await page.goto('/app/conta');
  const aside = page.getByRole('complementary', { name: 'Resumo da conta' });
  await expect(aside).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Identificação' })).toContainText('Conta pré-paga, em reais');
  await expect(aside.getByRole('region', { name: 'Chaves de API' })).toHaveCount(0);
  await expect(page.getByText('Chaves de API')).toHaveCount(0);
  await expect(aside.getByRole('region', { name: 'Atividade da conta' })).toBeVisible();
  await expect(page.getByText(/por pesquisa de jurisprudência/)).toBeVisible();
  await expect(page.getByText(/buscas estimadas|≈ \d+ buscas|por busca jurisprudencial/)).toHaveCount(0);
  const closure = aside.getByRole('region', { name: 'Encerramento de conta' });
  await expect(closure).toContainText('política publicada');
  await closure.getByRole('button', { name: 'Ir para Segurança' }).click();
  await expect(page).toHaveURL(/\/app\/conta\/seguranca/);
});

test('Conta: a coluna lateral vai para baixo no celular e a página não passa da largura', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'conta-celular@forgelex.test');
  await page.goto('/app/conta');
  await expect(page.getByRole('complementary', { name: 'Resumo da conta' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('Conectar IA: só conectar, autorizar e revogar; a privacidade diz que a IA lê os casos ativos', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'conectar@forgelex.test');
  await page.goto('/app/conectar');
  await expect(page.getByRole('heading', { level: 1, name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aplicativos autorizados' })).toBeVisible();
  for (const removed of ['Testar disponibilidade', 'Ver o guia completo para advogados', 'Atualizar aplicativos'])
    await expect(page.getByRole('button', { name: removed })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver o guia completo para advogados' })).toHaveCount(0);
  await expect(page.getByText('Gerenciar pesquisas salvas')).toHaveCount(0);
  await expect(page.getByText('Perguntas que o ForgeLex entende')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Casos' })).toHaveCount(0);
  await expect(page.getByText('A assinatura da sua IA não paga o ForgeLex')).toBeVisible();
  await expect(page.getByText(/confira o acesso/)).toHaveCount(0);
  await page.getByText('Privacidade da conexão MCP').click();
  await expect(page.getByText(/a sua IA passa a ler os seus casos ativos/)).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('no tema gelo o favicon e a cor da barra do navegador seguem a paleta, já na página de entrada', async ({
  page,
}) => {
  await page.goto('/entrar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gelo');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F4F7F8');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/forgelex-simbolo.svg');
  expect(await page.locator('meta[name="theme-color"]').count()).toBe(1);
});

test('Recentes e Pasta aparecem também fora da Mesa; escolher uma conversa ou Nova conversa volta à Mesa', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const pedido = unique('Conversa vista da Conta');
  await send(page, pedido);
  const executionId = new URL(page.url()).searchParams.get('executionId')!;

  await page.goto('/app/conta');
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  await expect(folder(page)).toBeVisible();
  const recent = sidebar(page).getByRole('list', { name: 'Recentes' }).getByTitle(pedido, { exact: true });
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page).toHaveURL(new RegExp(`/app/trabalho.*executionId=${executionId}`));
  await expect(page.getByText(/Trabalho concluído/)).toBeVisible();
  // Voltar devolve à Conta, não a uma Mesa vazia.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/conta$/);

  await page.goto('/app/conectar');
  await sidebar(page).getByRole('button', { name: 'Nova conversa' }).first().click();
  await expect(page).toHaveURL(/\/app\/trabalho$/);
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
});

test('Mesa vazia: a saudação e a caixa de pedido ficam no centro da área; com conversa, a caixa vai para baixo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const main = await page.locator('main').boundingBox();
  const box = await page.getByRole('region', { name: 'Novo pedido', exact: true }).boundingBox();
  expect(main && box).toBeTruthy();
  const visibleBottom = Math.min(main!.y + main!.height, 1000);
  const centerY = box!.y + box!.height / 2;
  expect((centerY - main!.y) / (visibleBottom - main!.y)).toBeGreaterThan(0.4);
  expect((centerY - main!.y) / (visibleBottom - main!.y)).toBeLessThan(0.6);
  expect(Math.abs(box!.x + box!.width / 2 - (main!.x + main!.width / 2))).toBeLessThan(24);
  expect(box!.width).toBeLessThanOrEqual(680);

  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Conta longa: ao rolar até o fim, a lateral continua inteira na tela, com o menu da conta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await login(page, 'rolagem@forgelex.test');
  await page.goto('/app/conta');
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Últimos lançamentos' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window.scrollTo(0, document.documentElement.scrollHeight), window.scrollY)))
    .toBeGreaterThan(0);
  const aside = await sidebar(page).boundingBox();
  expect(aside!.y).toBeLessThanOrEqual(1);
  expect(aside!.y + aside!.height).toBeGreaterThanOrEqual(699);
  await expect(accountButton(page)).toBeInViewport();
});

test('a coluna da lateral tem uma borda só', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const parentBorder = await sidebar(page).evaluate((aside) => getComputedStyle(aside.parentElement!).borderRightWidth);
  expect(parentBorder).toBe('0px');
});
