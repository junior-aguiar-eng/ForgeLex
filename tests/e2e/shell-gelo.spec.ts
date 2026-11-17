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

test('o tema gelo está ligado e a lateral tem trabalho, recursos e conta, na ordem do plano', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gelo');
  const aside = sidebar(page);
  await expect(aside.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button')).toHaveText([
    'Mesa',
    'Casos',
    'Jurisprudência',
  ]);
  await expect(aside.getByRole('navigation', { name: 'Recursos' }).getByRole('button')).toHaveText([
    'Visão geral',
    'Andamento processual',
    'Conectar IA',
    'Guia de conexão',
    'API para desenvolvedores',
  ]);
  await expect(aside.getByRole('navigation', { name: 'Conta' }).getByRole('button')).toHaveText([
    'Conta e faturamento',
    'Atividade da conta',
    'Segurança da conta',
    'Chaves de API',
  ]);
  await expect(aside.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  // A tela atual acende o item dela.
  await expect(aside.getByRole('button', { name: 'Visão geral', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('o cabeçalho é enxuto: só a marca, sem navegação, sem busca e sem item de ferramenta removida', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const header = page.getByRole('banner');
  await expect(header.getByRole('navigation')).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Pesquisar', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);
  // Em tela larga o botão da gaveta não aparece; sobra a marca.
  await expect(header.getByRole('button')).toHaveText(['ForgeLex']);
  for (const removed of [/Rascunhos/, /^Revisão$/]) {
    await expect(header.getByRole('button', { name: removed })).toHaveCount(0);
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

test('na Mesa a lateral nasce recolhida; fora dela, aberta; e o cliente pode trocar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const aside = sidebar(page);
  const toggle = (name: string) => aside.getByRole('button', { name, exact: true });

  await expect(toggle('Recolher menu lateral')).toHaveAttribute('aria-expanded', 'true');
  await aside.getByRole('button', { name: 'Mesa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  // Recolhida em trilho de ícones, mas cada item continua com nome acessível.
  await expect(toggle('Expandir menu lateral')).toHaveAttribute('aria-expanded', 'false');
  expect((await aside.boundingBox())!.width).toBeLessThan(100);
  await expect(aside.getByRole('button', { name: 'Casos', exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Sair da conta' })).toBeVisible();

  await toggle('Expandir menu lateral').click();
  await expect(toggle('Recolher menu lateral')).toBeVisible();
  expect((await aside.boundingBox())!.width).toBeGreaterThan(200);

  // Voltar a uma tela fora da Mesa com a lateral recolhida pelo cliente respeita a escolha dele.
  await toggle('Recolher menu lateral').click();
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

test('Primeiros passos: aparecem, ocultam, lembram por usuário e voltam quando o cliente pede', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const card = page.getByRole('region', { name: 'Primeiros passos' });
  const stored = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('forgelex.primeiros-passos.'))
        .sort(),
    );
  await expect(card.getByRole('listitem')).toHaveCount(4);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText([
    'Conecte a sua IA',
    'Abra a Mesa',
    'Pesquise jurisprudência',
    'Confira um andamento',
  ]);

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

  // Mostrar de novo apaga só a chave deste usuário.
  await page.getByRole('button', { name: 'Mostrar primeiros passos' }).click();
  await expect(card).toBeVisible();
  expect(await stored()).toEqual(['forgelex.primeiros-passos.outro-usuario']);
  await card.getByRole('button', { name: /^Conectar IA/ }).click();
  await expect(page).toHaveURL(/\/app\/conectar$/);
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
  await expect(aside.getByRole('button', { name: 'Chaves de API', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(aside).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menu lateral' })).toBeFocused();

  await toggle.click();
  await aside.getByRole('button', { name: 'Casos', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/casos/);
  await expect(aside).toBeHidden();
});

test('acessibilidade da casca nova: Visão, Mesa recolhida e gaveta aberta, sem violação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

  await expect(page.getByRole('region', { name: 'Primeiros passos' })).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await sidebar(page).getByRole('button', { name: 'Mesa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O que você precisa fazer hoje?' })).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  await expect(sidebar(page)).toBeVisible();
  expect((await scan()).violations).toEqual([]);
});
