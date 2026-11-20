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
  await expect(aside.getByRole('button', { name: 'Jurisprudência', exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  await expect(history).toHaveCount(0);

  // A escolha do cliente vale também fora da Mesa.
  await aside.getByRole('button', { name: 'Jurisprudência', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/pesquisa/);
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
  await aside.getByRole('button', { name: 'Jurisprudência', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/pesquisa/);
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

test('peça salva: abas Texto, Fontes, Documentos e Revisão, sem os diálogos antigos, e o texto digitado não se perde', async ({
  page,
}) => {
  const { piece, text } = await openSavedPiece(page);
  const tabs = piece.getByRole('tablist', { name: 'Partes da peça' });
  const tab = (name: string) => tabs.getByRole('tab', { name, exact: true });

  await expect(tab('Texto')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Fontes')).toBeEnabled();
  await expect(tab('Documentos')).toBeEnabled();
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

test('abas da peça: setas e Home/End trocam de aba, e peça sem caso não tem revisão', async ({ page }) => {
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

  // Sem caso: o texto e as fontes estão abertos (a aba Fontes explica e oferece criar o caso); sem versão salva não há
  // o que revisar.
  await page.goto('/app/trabalho');
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const fresh = page.getByRole('region', { name: 'Mesa da peça' }).getByRole('tablist', { name: 'Partes da peça' });
  await expect(fresh.getByRole('tab', { name: 'Texto', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(fresh.getByRole('tab', { name: 'Fontes', exact: true })).toBeEnabled();
  await expect(fresh.getByRole('tab', { name: 'Documentos', exact: true })).toBeDisabled();
  await expect(fresh.getByRole('tab', { name: 'Revisão', exact: true })).toBeDisabled();
});

test('peça sem caso: a aba Fontes explica e cria o caso só com o nome, e a peça passa a usá-lo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'semcaso@forgelex.test');
  await page.goto('/app/trabalho');
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  await piece.getByLabel('Título da peça', { exact: true }).fill('Apelação contra a sentença. Fatos relevantes.');
  await piece.getByRole('tab', { name: 'Fontes', exact: true }).click();
  const panel = piece.getByRole('region', { name: 'Peça sem caso' });
  await expect(panel).toContainText('Esta peça não está ligada a um caso');
  await expect(panel).toContainText('Sem caso, não há questões, cobertura de fontes nem análise de aderência');
  const name = panel.getByLabel('Nome do caso');
  await expect(name).toHaveValue('Apelação contra a sentença');
  // O cliente pode apagar a sugestão sem que ela volte sozinha.
  await name.fill('');
  await expect(name).toHaveValue('');
  await name.fill('Caso da apelação');
  await panel.getByRole('button', { name: 'Criar caso a partir desta conversa', exact: true }).click();
  await expect(piece.getByRole('region', { name: 'Peça sem caso' })).toHaveCount(0);
  await expect(piece.getByRole('tabpanel', { name: 'Fontes' })).toContainText('Nenhum julgado salvo');
  const cases = await (await page.request.get(api + '/api/v2/matters', { headers: apiHeaders })).json();
  const created = cases.items.find((item: { title: string }) => item.title === 'Caso da apelação');
  expect(created).toBeTruthy();
  expect(created.description ?? null).toBeNull();
});

test('acessibilidade das abas da peça: Texto, Fontes, Documentos e Revisão, sem violação', async ({ page }) => {
  const { piece } = await openSavedPiece(page);
  const tabs = piece.getByRole('tablist', { name: 'Partes da peça' });
  for (const name of ['Texto', 'Fontes', 'Documentos', 'Revisão']) {
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

// Seletor de caso no cabeçalho da Mesa, "Sem caso — somente texto" e criar caso a partir da conversa.
test('Mesa: o caso é escolhido no cabeçalho, com "Sem caso — somente texto", e o caso nasce só com o nome', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'caso@forgelex.test');
  const existing = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso já existente' } })
  ).json();
  await page.goto('/app/trabalho');
  const header = page.locator('[data-writing-desk] > header');
  const selector = header.getByLabel('Caso', { exact: true });

  await expect(selector).toBeVisible();
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue('');
  await expect(selector.locator('option').first()).toHaveText('Sem caso — somente texto');
  await selector.selectOption(existing.id);
  await expect(selector).toHaveValue(existing.id);
  // O seletor saiu de "Caso e documentos": não há dois campos "Caso" na página.
  await expect(page.getByLabel('Caso', { exact: true })).toHaveCount(1);
  await selector.selectOption('');

  // Criar caso a partir desta conversa: o nome vem do pedido, é editável e só o nome vai para o caso.
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Preciso das teses do STJ sobre o registro mantido após a quitação. Depois revise a peça.');
  await header.getByRole('button', { name: 'Criar caso a partir desta conversa', exact: true }).click();
  const form = header.getByRole('form', { name: 'Criar caso' });
  const name = form.getByLabel('Nome do caso');
  await expect(name).toHaveValue('Preciso das teses do STJ sobre o registro mantido após a quitação');
  await name.fill('Registro mantido após a quitação');
  await form.getByRole('button', { name: 'Criar caso', exact: true }).click();
  await expect(selector).toBeEnabled();
  await expect(selector.locator('option:checked')).toHaveText('Registro mantido após a quitação');
  const created = await (await page.request.get(api + '/api/v2/matters', { headers: apiHeaders })).json();
  const matter = created.items.find((item: { title: string }) => item.title === 'Registro mantido após a quitação');
  expect(matter).toBeTruthy();
  expect(matter.description ?? null).toBeNull();
  // O texto do pedido continua onde estava.
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(
    'Preciso das teses do STJ sobre o registro mantido após a quitação. Depois revise a peça.',
  );
});

test('Mesa: com a conversa em andamento o caso fica fixo, com o motivo escrito', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'fixo@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso da conversa' } })
  ).json();
  const run = await (
    await page.request.post(api + '/api/agentic/executions', {
      headers: { ...apiHeaders, 'Idempotency-Key': `fixo-${matter.id}` },
      data: {
        matterId: matter.id,
        actionId: 'research_question',
        objective: 'Pesquisar para o caso fixo',
        context: { text: 'Contexto sintético.', origin: 'USER', documents: [] },
      },
    })
  ).json();
  await page.goto(`/app/trabalho?executionId=${run.id}`);
  const selector = page.locator('[data-writing-desk] > header').getByLabel('Caso', { exact: true });
  await expect(selector).toBeVisible();
  await expect(selector).toBeDisabled();
  await expect(page.locator('[data-writing-desk] > header')).toContainText('Fixo nesta conversa');
  await expect(
    page.locator('[data-writing-desk] > header').getByRole('button', { name: 'Criar caso a partir desta conversa' }),
  ).toHaveCount(0);

  // Gerenciar casos segue disponível: o caso em uso pode ser renomeado, mas não sair de uso enquanto a conversa o usa.
  await page.locator('[data-writing-desk] > header').getByRole('button', { name: 'Gerenciar casos' }).click();
  const manager = page.getByRole('dialog', { name: 'Gerenciar casos' });
  const row = manager.getByRole('listitem').filter({ hasText: 'Caso da conversa' });
  await expect(row).toContainText('Em uso nesta conversa ou peça');
  await expect(row.getByRole('button', { name: 'Renomear Caso da conversa' })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Arquivar/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Mover para a lixeira/ })).toHaveCount(0);
});

test('Mesa: estado vazio com exemplos que só preenchem o pedido e a explicação dos dois selos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'vazio@forgelex.test');
  await page.goto('/app/trabalho');
  const composer = page.getByLabel('O que você precisa fazer?', { exact: true });
  await expect(composer).toBeVisible();
  await expect(composer).toHaveValue('');

  const examples = page.getByRole('region', { name: 'Comece por um exemplo' });
  await expect(examples.getByRole('button')).toHaveCount(3);
  await examples.getByRole('button', { name: /Teses sobre um tema/ }).click();
  await expect(composer).toHaveValue('Preciso das teses do STJ sobre ');
  // Um exemplo só preenche: nada foi enviado nem cobrado.
  await expect(page.getByRole('region', { name: 'Etapas do trabalho' })).toHaveCount(0);

  const seals = page.getByRole('region', { name: 'Dois selos, dois sentidos' });
  await expect(seals).toContainText('Análise da IA');
  await expect(seals).toContainText('É leitura da IA, sempre rotulada');
  await expect(seals).toContainText('Verificada');
  await expect(seals).toContainText('Número, data e órgão conferidos na fonte oficial');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Com a peça aberta, o estado vazio sai do caminho (a conversa não passa da altura da peça).
  await page.getByRole('button', { name: 'Nova peça', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Mesa da peça' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dois selos, dois sentidos' })).toHaveCount(0);
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

// V5: coluna lateral da Conta e "Como fica o trabalho" em Conectar IA.
test('Conta: a coluna lateral mostra identificação, chaves (só o prefixo), atividade e encerramento', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'conta@forgelex.test');
  const created = await page.request.post(api + '/api/v2/api-keys', {
    headers: apiHeaders,
    data: { name: 'Integração da conta', scopes: ['research:read'] },
  });
  expect(created.ok()).toBe(true);
  const { token, keyPrefix } = (await created.json()).key as { token: string; keyPrefix: string };
  expect(token.length).toBeGreaterThan(keyPrefix.length);
  await page.goto('/app/conta');
  const aside = page.getByRole('complementary', { name: 'Resumo da conta' });
  await expect(aside).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Identificação' })).toContainText('Conta pré-paga, em reais');
  const keys = aside.getByRole('region', { name: 'Chaves de API' });
  await expect(keys).toContainText('ativa');
  await expect(keys.getByRole('button', { name: 'Gerenciar chaves' })).toBeVisible();
  // O resumo mostra só o prefixo público: nunca o segredo.
  await expect(aside).not.toContainText(token);
  await expect(aside).toContainText(keyPrefix);
  await expect(aside.getByRole('region', { name: 'Atividade da conta' })).toBeVisible();
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

test('Conectar IA: "Como fica o trabalho" diz o que é cobrado e o que é gratuito', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'conectar@forgelex.test');
  await page.goto('/app/conectar');
  const how = page.getByRole('region', { name: 'Como fica o trabalho' });
  await expect(how.getByRole('listitem')).toHaveCount(3);
  await expect(how).toContainText('sua própria IA, com a sua assinatura');
  await expect(how).toContainText('comando gratuito não gera lançamento');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('no tema gelo o favicon e a cor da barra do navegador seguem a paleta, já na página de entrada', async ({
  page,
}) => {
  await page.goto('/entrar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gelo');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F4F7F8');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /fill='%230F5C6E'/);
  expect(await page.locator('meta[name="theme-color"]').count()).toBe(1);
});

// Gerenciar casos dentro da Mesa (U7): renomear, arquivar, restaurar e o caso em uso protegido.
test('Mesa: gerenciar casos renomeia, arquiva e restaura, e o seletor acompanha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'gerenciar@forgelex.test');
  const created = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso para gerenciar' } })
  ).json();
  await page.goto('/app/trabalho');
  const header = page.locator('[data-writing-desk] > header');
  const selector = header.getByLabel('Caso', { exact: true });
  await selector.selectOption(created.id);

  await header.getByRole('button', { name: 'Gerenciar casos', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Gerenciar casos' });
  await expect(manager).toBeVisible();
  await expect(manager.getByText('Caso para gerenciar')).toBeVisible();

  // Renomear: nome curto demais é recusado em texto; o válido atualiza a lista e o seletor.
  await manager.getByRole('button', { name: 'Renomear Caso para gerenciar' }).click();
  const field = manager.getByLabel('Novo nome do caso');
  await field.fill('ab');
  await manager.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(manager.getByRole('alert')).toContainText('pelo menos 3 letras');
  await field.fill('Caso renomeado pela Mesa');
  await manager.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(manager.getByRole('status')).toContainText('Nome do caso atualizado');
  await expect(manager.getByText('Caso renomeado pela Mesa')).toBeVisible();
  const afterRename = await (await page.request.get(api + '/api/v2/matters', { headers: apiHeaders })).json();
  expect(afterRename.items.find((item: { id: string }) => item.id === created.id).title).toBe(
    'Caso renomeado pela Mesa',
  );

  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Arquivar, com confirmação que diz o efeito sobre a IA; o caso sai do seletor e deixa de ser o escolhido.
  await manager.getByRole('button', { name: 'Arquivar: Caso renomeado pela Mesa' }).click();
  const confirm = page.getByRole('dialog', { name: /Arquivar caso/ });
  await expect(confirm).toContainText('O acesso pela IA será encerrado');
  await confirm.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await expect(manager.getByRole('status')).toContainText('Caso arquivado');
  await expect(manager.getByText('Caso renomeado pela Mesa')).toHaveCount(0);
  await expect(selector.locator('option', { hasText: 'Caso renomeado pela Mesa' })).toHaveCount(0);
  await expect(selector).toHaveValue('');

  // Em "Arquivados" aparece, sem renomear, e restaurar o devolve ao seletor.
  await manager.getByLabel('Mostrar casos').selectOption('archived');
  await expect(manager.getByText('Caso renomeado pela Mesa')).toBeVisible();
  await expect(manager.getByRole('button', { name: /^Renomear/ })).toHaveCount(0);
  await manager.getByRole('button', { name: 'Restaurar: Caso renomeado pela Mesa' }).click();
  await page
    .getByRole('dialog', { name: /Restaurar caso/ })
    .getByRole('button', { name: 'Restaurar', exact: true })
    .click();
  await expect(manager.getByRole('status')).toContainText('Caso restaurado');
  await manager.getByRole('button', { name: 'Fechar' }).click();
  await expect(manager).toHaveCount(0);
  await expect(selector.locator('option', { hasText: 'Caso renomeado pela Mesa' })).toHaveCount(1);
  // O texto do pedido e a página seguem onde estavam: nada recarregou.
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toBeVisible();
});

// Documentos do caso dentro da Mesa (U7): a aba lista, arquiva, restaura e abre, sem a exclusão definitiva.
test('Mesa: a aba Documentos lista os documentos do caso, arquiva e restaura com confirmação e abre o documento', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'documentos@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso dos documentos' } })
  ).json();
  for (const [title, originalFilename, content] of [
    ['Petição inicial', 'peticao.txt', 'O autor alega o descumprimento do contrato.'],
    ['Contrato de locação', 'contrato.txt', 'As partes ajustaram o prazo de trinta meses.'],
  ]) {
    const response = await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers: apiHeaders,
      data: { title, originalFilename, mimeType: 'text/plain', content },
    });
    expect(response.ok()).toBe(true);
  }
  const { draft, version } = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers: apiHeaders,
      data: { title: 'Peça dos documentos', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto salvo.' }] },
    })
  ).json();
  await page.goto(
    `/app/trabalho?${new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id })}`,
  );
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(piece.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Texto salvo.');

  await piece
    .getByRole('tablist', { name: 'Partes da peça' })
    .getByRole('tab', { name: 'Documentos', exact: true })
    .click();
  const panel = piece.getByRole('tabpanel', { name: 'Documentos' });
  await expect(panel.getByRole('heading', { name: 'Documentos do caso' })).toBeVisible();
  await expect(panel.getByText('Petição inicial')).toBeVisible();
  await expect(panel.getByText('Contrato de locação')).toBeVisible();
  await expect(panel).toContainText('peticao.txt · Disponível');
  // A exclusão definitiva não é oferecida aqui.
  await expect(panel.getByRole('button', { name: /Excluir definitivamente/ })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Arquivar, com a confirmação que diz o efeito sobre a IA; o documento sai da lista em uso.
  await panel.getByRole('button', { name: 'Arquivar: Petição inicial' }).click();
  const confirm = page.getByRole('dialog', { name: /Arquivar documento/ });
  await expect(confirm).toContainText('O acesso pela IA será encerrado');
  await confirm.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Documento arquivado' })).toBeVisible();
  await expect(panel.getByText('Petição inicial')).toHaveCount(0);
  await expect(panel.getByText('Contrato de locação')).toBeVisible();

  // Em "Arquivados" aparece, e restaurar o devolve à lista em uso.
  await panel.getByLabel('Mostrar documentos').selectOption('archived');
  await expect(panel.getByText('Petição inicial')).toBeVisible();
  await expect(panel).toContainText('peticao.txt · Arquivado');
  await panel.getByRole('button', { name: 'Restaurar: Petição inicial' }).click();
  await page
    .getByRole('dialog', { name: /Restaurar documento/ })
    .getByRole('button', { name: 'Restaurar', exact: true })
    .click();
  await expect(panel.getByRole('status').filter({ hasText: 'Documento restaurado' })).toContainText(
    'O acesso pela IA precisa de nova autorização',
  );
  await panel.getByLabel('Mostrar documentos').selectOption('active');
  await expect(panel.getByText('Petição inicial')).toBeVisible();

  // Abrir o documento usa o leitor que a peça já tem.
  await panel.getByRole('button', { name: 'Abrir documento: Contrato de locação' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'trinta meses' })).toBeVisible();
});

test('Mesa: depois de arquivar um documento a lista segue à vista enquanto recarrega, com o aviso da operação', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'recarga@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso da recarga' } })
  ).json();
  for (const [title, originalFilename, content] of [
    ['Documento um', 'um.txt', 'Primeiro texto.'],
    ['Documento dois', 'dois.txt', 'Segundo texto.'],
  ]) {
    const response = await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers: apiHeaders,
      data: { title, originalFilename, mimeType: 'text/plain', content },
    });
    expect(response.ok()).toBe(true);
  }
  const { draft, version } = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers: apiHeaders,
      data: { title: 'Peça da recarga', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto salvo.' }] },
    })
  ).json();
  await page.goto(
    `/app/trabalho?${new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id })}`,
  );
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(piece.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Texto salvo.');
  await piece
    .getByRole('tablist', { name: 'Partes da peça' })
    .getByRole('tab', { name: 'Documentos', exact: true })
    .click();
  const panel = piece.getByRole('tabpanel', { name: 'Documentos' });
  await expect(panel.getByText('Documento um')).toBeVisible();

  // Segura a recarga que vem depois da operação, para observar o que o cliente vê enquanto ela não termina.
  let hold = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/v2\/matters\/[^/?]+\?view=/, async (route) => {
    if (hold) await gate;
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Arquivar: Documento um' }).click();
  hold = true;
  await page
    .getByRole('dialog', { name: /Arquivar documento/ })
    .getByRole('button', { name: 'Arquivar', exact: true })
    .click();
  await expect(panel.getByText('Documento arquivado para consulta.')).toBeVisible();
  // Enquanto recarrega, a lista continua à vista e há um só aviso de estado.
  await expect(panel.getByText('Documento dois')).toBeVisible();
  await expect(panel.getByText('Carregando documentos…')).toHaveCount(0);
  await expect(panel.getByRole('status')).toHaveCount(1);
  release();
  await expect(panel.getByText('Documento um')).toHaveCount(0);
  await expect(panel.getByText('Documento dois')).toBeVisible();
});

// TRAVA DE PRODUTO (AGENTS.md): não existe tela "Dados do caso". Tudo vive na Mesa; a exclusão definitiva fica no gerenciador.
const trashed = async (page: Page, title: string) => {
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title } })
  ).json();
  const response = await page.request.post(`${api}/api/v2/matters/${matter.id}/trash`, {
    headers: apiHeaders,
    data: { expectedLifecycleRevision: 0 },
  });
  expect(response.ok()).toBe(true);
  return matter as { id: string };
};

test('não há "Dados do caso": /app/casos, com ou sem caso, abre a Mesa, e a lateral não tem "Casos"', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'dadosdocaso@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso dos dados' } })
  ).json();
  const aside = sidebar(page);
  for (const url of ['/app/casos', `/app/casos?caso=${matter.id}`]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/app\/trabalho$/);
    await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dados do caso' })).toHaveCount(0);
    await expect(aside.getByRole('button', { name: 'Casos', exact: true })).toHaveCount(0);
  }
});

test('Mesa: nenhum botão "Dados do caso", nem com o caso escolhido nem na aba Documentos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'entradadados@forgelex.test');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso da entrada' } })
  ).json();
  await page.goto('/app/trabalho');
  const header = page.locator('[data-writing-desk] > header');
  await header.getByLabel('Caso', { exact: true }).selectOption(matter.id);
  await expect(header.getByRole('button', { name: 'Gerenciar casos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dados do caso/ })).toHaveCount(0);
});

test('Mesa: caso na lixeira é excluído de vez no próprio gerenciador, pedindo o nome do caso', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'lixeiradados@forgelex.test');
  // Título único: os casos de outros testes (e de repetições) vivem no mesmo tenant e não podem se confundir com este.
  const title = `Caso para excluir de vez ${Date.now()}`;
  const matter = await trashed(page, title);
  await page.goto('/app/trabalho');
  const header = page.locator('[data-writing-desk] > header');
  await header.getByRole('button', { name: 'Gerenciar casos', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Gerenciar casos' });
  await manager.getByLabel('Mostrar casos').selectOption('trash');
  await expect(manager.getByRole('button', { name: `Restaurar: ${title}` })).toBeVisible();
  await manager.getByRole('button', { name: `Excluir definitivamente: ${title}` }).click();

  // Sem o nome, o botão de confirmar não libera; nada é excluído ao abrir o diálogo.
  const confirm = page.getByRole('dialog', { name: /Excluir definitivamente caso/ });
  const submit = confirm.getByRole('button', { name: 'Excluir definitivamente', exact: true });
  await expect(submit).toBeDisabled();
  const still = await (await page.request.get(`${api}/api/v2/matters?view=trash`, { headers: apiHeaders })).json();
  expect(still.items.some((item: { id: string }) => item.id === matter.id)).toBe(true);

  await confirm.getByLabel('Digite o nome do caso para confirmar').fill(title);
  await expect(submit).toBeEnabled();
  // Este ambiente não habilita a exclusão definitiva no servidor (a resposta é "indisponível"): o que a Mesa garante é
  // pedir com o nome do caso e mostrar a resposta sem sair do gerenciador.
  const sent = page.waitForRequest((request) => request.url().endsWith(`/api/v2/matters/${matter.id}/purge`));
  await submit.click();
  expect(JSON.parse((await sent).postData() ?? '{}').confirmation).toBe(title);
  await expect(confirm.getByRole('alert')).toBeVisible();
});

test('Visão: os primeiros passos só aparecem quando se sabe o resultado, sem trocar de destaque nem animar depois', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Segura a lista de casos, que decide o passo "Criar o primeiro caso", para ver o que o cliente vê enquanto espera.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname === '/api/v2/matters',
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await login(page, 'passos@forgelex.test');
  await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso dos passos' } });

  const steps = page.getByRole('region', { name: 'Primeiros passos' });
  await expect(steps).toBeVisible();
  // Enquanto espera: sem "Falta este", sem "Feito", sem botões de ação e sem a contagem, só o aviso de que está verificando.
  await expect(steps.getByText('Verificando…')).toBeVisible();
  await expect(steps.getByText('Falta este')).toHaveCount(0);
  await expect(steps.getByText('Feito')).toHaveCount(0);
  await expect(steps.getByRole('button', { name: /Conectar IA|Criar um caso|Abrir a jurisprudência/ })).toHaveCount(0);
  await expect(steps.getByText(/de \d+ concluídos/)).toHaveCount(0);
  await expect(steps.getByRole('status')).toContainText('Verificando seus primeiros passos');

  release();
  await expect(steps.getByText(/\d de \d concluídos/)).toBeVisible();
  await expect(steps.getByText('Falta este')).toHaveCount(1);
  // Depois de aparecer, o estado é o final: nada muda de estilo nem anima (era isso que o axe pegava no meio da troca).
  const stable = async () => ({
    primary: await steps.locator('.btn-primary').allTextContents(),
    animating: await page.evaluate(() => document.getAnimations().length),
  });
  const first = await stable();
  await page.waitForTimeout(400);
  expect(await stable()).toEqual(first);
  expect(first.animating).toBe(0);
  expect(first.primary).toHaveLength(1);
});
