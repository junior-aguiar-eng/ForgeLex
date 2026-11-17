import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Casca do tema gelo (V2). `playwright.shell-gelo.config.ts` sobe o app com VITE_FORGELEX_THEME=gelo.

async function login(page: Page, email = 'casca@forgelex.test') {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

const sidebar = (page: Page) => page.locator('#forgelex-sidebar');

test('o tema gelo está ligado e a lateral tem a marca, Trabalho e Conta e recursos, como no protótipo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gelo');
  const aside = sidebar(page);
  await expect(aside.getByRole('button', { name: 'ForgeLex, ir para o início' })).toBeVisible();
  await expect(aside.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button')).toHaveText([
    'Mesa',
    'Casos',
    'Jurisprudência',
  ]);
  await expect(aside.getByRole('navigation', { name: 'Conta e recursos' }).getByRole('button')).toHaveText([
    'Visão geral',
    'Andamento processual',
    'Conectar IA',
    'Conta',
  ]);
  await expect(aside.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  // A tela atual acende o item dela, e o saldo vem da conta.
  await expect(aside.getByRole('button', { name: 'Visão geral', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(aside.getByText('Saldo', { exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Recarregar' })).toBeVisible();
});

test('não há cabeçalho na tela larga: a marca e a navegação estão na lateral, sem item de ferramenta removida', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pesquisar', exact: true })).toHaveCount(0);
  for (const removed of [/Rascunhos/, /^Revisão$/]) {
    await expect(sidebar(page).getByRole('button', { name: removed })).toHaveCount(0);
  }
});

test('Rascunhos e Revisão antigos abrem a Mesa e acendem o item Mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  for (const path of ['/app/rascunhos', '/app/revisao']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'Mesa', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('na Mesa a lateral fica aberta com as conversas recentes dentro dela, e o cliente pode recolhê-la', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const aside = sidebar(page);
  const toggle = (name: string) => aside.getByRole('button', { name, exact: true });
  const history = page.getByRole('complementary', { name: 'Histórico de conversas' });

  // Fora da Mesa não há lista de conversas na lateral.
  await expect(toggle('Recolher menu lateral')).toHaveAttribute('aria-expanded', 'true');
  await expect(history).toHaveCount(0);

  await aside.getByRole('button', { name: 'Mesa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  // Aberta na Mesa, com as conversas recentes dentro dela (e não numa coluna ao lado).
  await expect(toggle('Recolher menu lateral')).toHaveAttribute('aria-expanded', 'true');
  expect((await aside.boundingBox())!.width).toBeGreaterThan(200);
  await expect(aside.getByRole('complementary', { name: 'Histórico de conversas' })).toBeVisible();
  await expect(history).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Recolher conversas' })).toHaveCount(0);

  // Recolhida em trilho de ícones, cada item continua com nome acessível e a lista de conversas sai.
  await toggle('Recolher menu lateral').click();
  await expect(toggle('Expandir menu lateral')).toHaveAttribute('aria-expanded', 'false');
  expect((await aside.boundingBox())!.width).toBeLessThan(100);
  await expect(aside.getByRole('button', { name: 'Casos', exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  await expect(history).toHaveCount(0);

  // A escolha do cliente vale também fora da Mesa.
  await aside.getByRole('button', { name: 'Casos', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/casos/);
  await expect(toggle('Expandir menu lateral')).toBeVisible();
});

test('Andamento processual e Jurisprudência: rótulo, caminho, título e redirecionamento da rota antiga', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const aside = sidebar(page);

  await aside.getByRole('button', { name: 'Andamento processual', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/andamento-processual$/);
  await expect(page).toHaveTitle('ForgeLex · Andamento processual');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Andamento processual');

  await aside.getByRole('button', { name: 'Jurisprudência', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/pesquisa$/);
  await expect(page).toHaveTitle('ForgeLex · Jurisprudência');

  // A rota antiga redireciona sem perder consulta nem âncora, e o item continua aceso.
  await page.goto('/app/consulta-processual?x=1#a');
  await expect(page).toHaveURL(/\/app\/andamento-processual\?x=1#a$/);
  await expect(page).toHaveTitle('ForgeLex · Andamento processual');
  await expect(aside.getByRole('button', { name: 'Andamento processual', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // O site público não mudou: a página pública de consulta continua em /consulta-processual.
  await page.goto('/consulta-processual');
  await expect(page).toHaveURL(/\/consulta-processual$/);
});

test('Visão: primeiros passos com estado real, atalhos, casos, conexões e consumo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.getByRole('heading', { level: 1, name: 'O que você precisa fazer hoje?' })).toBeVisible();
  const card = page.getByRole('region', { name: 'Primeiros passos' });
  await expect(card.getByRole('listitem')).toHaveCount(3);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText([
    'Conectar sua IA',
    'Criar o primeiro caso',
    'Verificar uma citação',
  ]);
  await expect(card.getByText(/^\d de 3 concluídos$/)).toBeVisible();
  await expect(card.getByRole('progressbar', { name: 'Primeiros passos concluídos' })).toBeVisible();

  const shortcuts = page.getByRole('region', { name: 'Atalhos' });
  await expect(shortcuts.getByRole('button')).toHaveText([/Abrir a Mesa/, /Pesquisar o STJ/, /Conectar sua IA/]);
  await expect(page.getByRole('region', { name: 'Casos ativos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Conexões' })).toContainText('MCP remoto');
  await expect(page.getByRole('region', { name: 'Conexões' })).toContainText('Chaves de API');
  await expect(page.getByRole('region', { name: 'Consumo do mês' })).toContainText(/R\$/);
  await expect(page.getByRole('region', { name: 'Consumo do mês' })).toContainText(
    'Verificações de autoridade e consultas processuais não entram neste total.',
  );

  await shortcuts.getByRole('button', { name: /Abrir a Mesa/ }).click();
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/trabalho/);
});

test('Primeiros passos: ocultam, lembram por usuário e voltam quando o cliente pede', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const card = page.getByRole('region', { name: 'Primeiros passos' });
  const stored = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('forgelex.primeiros-passos.'))
        .sort(),
    );
  await expect(card).toBeVisible();

  // O estado de outro usuário no mesmo navegador não esconde o cartão deste.
  await page.evaluate(() => localStorage.setItem('forgelex.primeiros-passos.outro-usuario', 'oculto'));
  await page.reload();
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'Ocultar primeiros passos' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mostrar primeiros passos' })).toBeVisible();
  const keys = await stored();
  expect(keys).toHaveLength(2);
  expect(keys).toContain('forgelex.primeiros-passos.outro-usuario');
  // A chave deste usuário leva o identificador dele.
  expect(keys.find((key) => key !== 'forgelex.primeiros-passos.outro-usuario')!.length).toBeGreaterThan(
    'forgelex.primeiros-passos.'.length,
  );

  // Persiste ao recarregar e ao sair e entrar de novo.
  await page.reload();
  await expect(card).toHaveCount(0);
  await sidebar(page).getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await login(page);
  await expect(card).toHaveCount(0);

  // Mostrar de novo apaga só a chave deste usuário; o passo pendente leva à tela dele.
  await page.getByRole('button', { name: 'Mostrar primeiros passos' }).click();
  await expect(card).toBeVisible();
  expect(await stored()).toEqual(['forgelex.primeiros-passos.outro-usuario']);
  await card.getByRole('button', { name: 'Abrir a jurisprudência' }).click();
  await expect(page).toHaveURL(/\/app\/pesquisa$/);
});

test('Conta e Conectar IA têm as seções no alto, e a lateral acende o item certo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const aside = sidebar(page);

  await aside.getByRole('button', { name: 'Conta', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conta$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Seções da conta' });
  await expect(sections.getByRole('button')).toHaveText(['Faturamento', 'Atividade', 'Segurança', 'Chaves de API']);
  await expect(sections.getByRole('button', { name: 'Faturamento' })).toHaveAttribute('aria-current', 'page');

  await sections.getByRole('button', { name: 'Atividade' }).click();
  await expect(page).toHaveURL(/\/app\/conta\/atividade$/);
  await expect(aside.getByRole('button', { name: 'Conta', exact: true })).toHaveAttribute('aria-current', 'page');
  await sections.getByRole('button', { name: 'Chaves de API' }).click();
  await expect(page).toHaveURL(/\/app\/conta\/chaves$/);

  await aside.getByRole('button', { name: 'Conectar IA', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conectar$/);
  const connect = page.getByRole('navigation', { name: 'Seções de Conectar IA' });
  await expect(connect.getByRole('button')).toHaveText(['Conexão', 'Guia de conexão', 'API para desenvolvedores']);
  await connect.getByRole('button', { name: 'API para desenvolvedores' }).click();
  await expect(page).toHaveURL(/\/app\/desenvolvedores\/api$/);
  await expect(aside.getByRole('button', { name: 'Conectar IA', exact: true })).toHaveAttribute('aria-current', 'page');
  await connect.getByRole('button', { name: 'Guia de conexão' }).click();
  await expect(page).toHaveURL(/\/app\/guia\/mcp$/);
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

test('celular: a gaveta tem os mesmos itens, Escape fecha e devolve o foco, escolher um item fecha', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const aside = sidebar(page);
  await expect(aside).toBeHidden();

  const toggle = page.getByRole('button', { name: 'Abrir menu lateral' });
  await toggle.click();
  await expect(aside).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Jurisprudência', exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Conta', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(aside).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menu lateral' })).toBeFocused();

  await toggle.click();
  await aside.getByRole('button', { name: 'Casos', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/casos/);
  await expect(aside).toBeHidden();
});

test('acessibilidade da casca nova: Visão, Mesa recolhida, Conta e gaveta aberta, sem violação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

  await expect(page.getByRole('region', { name: 'Primeiros passos' })).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await sidebar(page).getByRole('button', { name: 'Mesa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await sidebar(page).getByRole('button', { name: 'Conta', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conta e créditos' })).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  await expect(sidebar(page)).toBeVisible();
  expect((await scan()).violations).toEqual([]);
});

test('acessibilidade de Entrar com a coluna de contexto, sem violação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/entrar');
  await expect(page.getByRole('region', { name: 'Sobre o ForgeLex' })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

// A peça no gelo: abas Texto, Fontes e Revisão no lugar dos diálogos "Fontes do caso" e "Conferência da peça".
const api = 'http://127.0.0.1:3301';
const apiHeaders = { authorization: 'Bearer phase7-e2e-access-token' };

async function openSavedPiece(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'abas@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso das abas' } })
  ).json();
  const { draft, version } = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers: apiHeaders,
      data: { title: 'Peça das abas', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto salvo.' }] },
    })
  ).json();
  const selection = new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id });
  await page.goto(`/app/trabalho?${selection}`);
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  const text = piece.getByLabel('Texto da seção 1', { exact: true });
  await expect(text).toHaveValue('Texto salvo.');
  return { piece, text };
}

test('peça salva: abas Texto, Fontes e Revisão, sem os diálogos antigos, e o texto digitado não se perde', async ({
  page,
}) => {
  const { piece, text } = await openSavedPiece(page);
  const tabs = piece.getByRole('tablist', { name: 'Partes da peça' });
  const tab = (name: string) => tabs.getByRole('tab', { name, exact: true });

  await expect(tab('Texto')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Fontes')).toBeEnabled();
  await expect(tab('Revisão')).toBeEnabled();
  // Os botões que abriam diálogos saíram do cabeçalho.
  await expect(piece.getByRole('button', { name: 'Fontes do caso', exact: true })).toHaveCount(0);
  await expect(piece.getByRole('button', { name: 'Conferência da peça', exact: true })).toHaveCount(0);

  await text.fill('Texto digitado e ainda não salvo.');
  await tab('Fontes').click();
  await expect(tab('Fontes')).toHaveAttribute('aria-selected', 'true');
  await expect(piece.getByRole('tabpanel', { name: 'Fontes' })).toContainText('Nenhum julgado salvo');
  await expect(text).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await tab('Revisão').click();
  await expect(piece.getByRole('tabpanel', { name: 'Revisão' })).toContainText('Versão salva');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Voltar ao texto devolve exatamente o que foi digitado, inclusive sem salvar.
  await tab('Texto').click();
  await expect(text).toBeVisible();
  await expect(text).toHaveValue('Texto digitado e ainda não salvo.');
});

test('abas da peça: setas e Home/End trocam de aba, e peça sem caso só tem o texto', async ({ page }) => {
  const { piece } = await openSavedPiece(page);
  const tabs = piece.getByRole('tablist', { name: 'Partes da peça' });
  await tabs.getByRole('tab', { name: 'Texto', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Fontes', exact: true })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Fontes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Revisão', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabs.getByRole('tab', { name: 'Texto', exact: true })).toHaveAttribute('aria-selected', 'true');

  // Sem caso não há fontes do caso nem versão salva para revisar.
  await page.goto('/app/trabalho');
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const fresh = page.getByRole('region', { name: 'Mesa da peça' }).getByRole('tablist', { name: 'Partes da peça' });
  await expect(fresh.getByRole('tab', { name: 'Texto', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(fresh.getByRole('tab', { name: 'Fontes', exact: true })).toBeDisabled();
  await expect(fresh.getByRole('tab', { name: 'Revisão', exact: true })).toBeDisabled();
});

test('acessibilidade das abas da peça: Texto, Fontes e Revisão, sem violação', async ({ page }) => {
  const { piece } = await openSavedPiece(page);
  const tabs = piece.getByRole('tablist', { name: 'Partes da peça' });
  for (const name of ['Texto', 'Fontes', 'Revisão']) {
    await tabs.getByRole('tab', { name, exact: true }).click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      result.violations.map((v) => `${v.id}: ${v.help}`),
      `aba ${name}`,
    ).toEqual([]);
  }
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
