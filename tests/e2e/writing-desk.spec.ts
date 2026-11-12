import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
const api = 'http://127.0.0.1:3301';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

async function selectionFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const createCase = async (title: string) =>
    (await page.request.post(api + '/api/v2/matters', { headers, data: { title } })).json();
  const matter = await createCase('Caso A · seleção');
  const other = await createCase('Caso B · seleção');
  const { draft, version } = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers,
      data: { title: 'Peça A', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto salvo de A.' }] },
    })
  ).json();
  const objective = `Pesquisar no caso B ${other.id.slice(0, 8)}`;
  const run = await (
    await page.request.post(api + '/api/agentic/executions', {
      headers: { ...headers, 'Idempotency-Key': `selection-${matter.id}` },
      data: {
        matterId: other.id,
        actionId: 'research_question',
        objective,
        context: { text: 'Contexto sintético B.', origin: 'USER', documents: [] },
      },
    })
  ).json();
  const selection = new URLSearchParams({ matterId: matter.id, draftId: draft.id, versionId: version.id });
  await page.goto(`/app/trabalho?${selection}`);
  const editor = page.getByRole('region', { name: 'Mesa da peça' });
  const text = editor.getByLabel('Texto da seção 1', { exact: true });
  await expect(text).toHaveValue('Texto salvo de A.');
  return { selection, run, editor, text, other, objective };
}

test('edita apenas o trecho selecionado da peça salva', async ({ page }) => {
  const { selection, text, editor } = await selectionFixture(page);
  await text.press('Home');
  for (let i = 0; i < 6; i++) await text.press('ArrowRight');
  for (let i = 0; i < 5; i++) await text.press('Shift+ArrowRight');
  await editor.getByRole('button', { name: 'Usar trecho na conversa' }).click();
  await expect(page.getByText('Trecho para editar · salvo')).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'O que você precisa fazer?' });
  await composer.fill('Corrigir apenas o trecho selecionado.');
  const request = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/executions'),
  );
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  expect((await request).postDataJSON().context.deskEdit).toMatchObject({
    versionId: selection.get('versionId'),
    start: 6,
    end: 11,
    before: 'salvo',
  });
  const draftUrl = `${api}/api/v2/matters/${selection.get('matterId')}/drafts/${selection.get('draftId')}`;
  await expect
    .poll(async () => {
      const response = await page.request.get(draftUrl, { headers });
      return (await response.json()).currentVersion?.sections[0]?.content;
    })
    .toBe('Texto revisto de A.');
});

test('seleção persistida da Mesa retorna com caso, peça e versão e abre após recarga', async ({ page }) => {
  const { selection, text } = await selectionFixture(page);
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await nav.getByRole('button', { name: 'Casos', exact: true }).click();
  await nav.getByRole('button', { name: 'Mesa', exact: true }).click();
  for (const [key, value] of selection) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  await page.reload();
  await expect(text).toHaveValue('Texto salvo de A.');
});

test('seleção persistida da Mesa desvincula peça antiga ao trocar conversa e recupera a edição ao voltar', async ({
  page,
}) => {
  const { run, editor, text, other, objective } = await selectionFixture(page);
  await text.fill('Texto local de A, ainda não salvo.');
  await page
    .getByRole('complementary', { name: 'Histórico de conversas' })
    .getByRole('button', { name: objective, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`executionId=${run.id}`));
  await expect(editor).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('draftId')).toBeNull();
  const composer = page.getByLabel('O que você precisa fazer?', { exact: true });
  await composer.fill('Continue a pesquisa do caso B.');
  const send = page.getByRole('button', { name: 'Enviar', exact: true });
  await page.getByRole('button', { name: 'Abrir peça', exact: true }).click();
  await expect(text).toHaveValue('Texto local de A, ainda não salvo.');
  await expect(send).toBeDisabled();
  await page.goBack();
  await expect(editor).not.toBeVisible();
  let sent: { matterId?: string; conversationId?: string; context?: { draft?: unknown } } | undefined;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await send.click();
  await expect.poll(() => sent?.conversationId).toBe(run.conversationId);
  expect(sent?.matterId).toBe(other.id);
  expect(sent?.context?.draft).toBeUndefined();
  await page.goBack();
  await expect(text).toHaveValue('Texto local de A, ainda não salvo.');
  await page.goForward();
  await expect(editor).not.toBeVisible();
});

test('seleção persistida da Mesa ignora execução recebida depois de voltar', async ({ page }) => {
  const { run, text, objective, selection } = await selectionFixture(page);
  await text.fill('Edição preservada durante a resposta.');
  await page
    .getByRole('complementary', { name: 'Histórico de conversas' })
    .getByRole('button', { name: objective, exact: true })
    .click();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Continue a pesquisa B.');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/agentic/executions', async (route) => {
    await pending;
    await route.fulfill({ status: 200, json: run });
  });
  const command = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/agentic/executions'),
  );
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await command;
  await page.goBack();
  await expect(text).toHaveValue('Edição preservada durante a resposta.');
  const received = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/agentic/executions'),
  );
  release();
  await (await received).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const params = new URL(page.url()).searchParams;
  expect(params.get('executionId')).toBeNull();
  expect(params.get('draftId')).toBe(selection.get('draftId'));
  await expect(text).toHaveValue('Edição preservada durante a resposta.');
});

test('seleção persistida da Mesa exige confirmação para enviar com uma versão diferente da indicada', async ({
  page,
}) => {
  const { selection, editor, text } = await selectionFixture(page);
  const previous = selection.get('versionId');
  const written = await page.request.post(
    `${api}/api/v2/matters/${selection.get('matterId')}/drafts/${selection.get('draftId')}/versions`,
    {
      headers,
      data: {
        baseVersionId: previous,
        title: 'Peça A atualizada',
        sections: [{ ordinal: 0, title: 'Fatos', content: 'Nova versão salva de A.' }],
      },
    },
  );
  expect(written.ok()).toBe(true);
  const { version } = await written.json();
  await page.goto(`/rascunhos?${selection}`);
  await expect(text).toHaveValue('Nova versão salva de A.');
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Revise a peça.');
  const send = page.getByRole('button', { name: 'Enviar', exact: true });
  await expect(send).toBeDisabled();
  expect(new URL(page.url()).searchParams.get('versionId')).toBe(previous);
  await editor.getByRole('button', { name: 'Usar versão aberta', exact: true }).click();
  await expect(send).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('versionId')).toBe(version.id);
});

test('uma caixa envia pedido e contexto com a opção selecionada', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /^Sem caso/ }).click();
  const composer = page.getByRole('region', { name: 'Novo pedido', exact: true });
  await expect(composer.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByLabel('Contexto escrito')).toHaveCount(0);
  const message = 'Pesquisar: o serviço contratado não foi entregue. Quais fundamentos considerar?';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  await page.getByLabel('Opção do pedido').selectOption('research_question');
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.actionId).toBe('research_question');
  expect(sent.objective).toBe(message);
  expect(sent.context.text).toBe(message);
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(message);
  await page.getByLabel('Opção do pedido').selectOption('');
  await expect(page.getByLabel('Opção do pedido').locator('option:checked')).toHaveText('Automático');
  sent = undefined;
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.actionId).toBeUndefined();
  expect(sent.objective).toBe(message);
  expect(sent.context.text).toBe(message);
});

test('histórico lateral visível, exclusão recuperável e seletor legível', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const commandId = randomUUID();
  const title = `Conversa para conferir a lateral ${commandId}`;
  const created = await page.request.post(api + '/api/agentic/executions', {
    headers: { ...headers, 'Idempotency-Key': commandId },
    data: {
      objective: title,
      context: { text: 'Contexto sintético local', origin: 'USER', documents: [] },
    },
  });
  expect(created.ok()).toBe(true);
  const run = await created.json();
  expect(run.objective).toBe(title);
  await page.reload();
  const sidebar = page.getByRole('complementary', { name: 'Histórico de conversas' });
  const open = sidebar.getByRole('button', { name: title, exact: true });
  await expect(open).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Conversas', exact: true })).toHaveCount(0);
  const selector = page.getByLabel('Opção do pedido');
  await selector.selectOption('research_question');
  expect(
    await selector.evaluate((element) => {
      const select = element as HTMLSelectElement;
      const style = getComputedStyle(select);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = style.font;
      return (
        select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) >=
        ctx.measureText(select.selectedOptions[0].text).width
      );
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  await expect(sidebar).toBeVisible();
  const sidebarBox = (await sidebar.boundingBox())!;
  const chatBox = (await page.locator('[data-agentic-workspace]').boundingBox())!;
  const pieceBox = (await page.getByRole('region', { name: 'Mesa da peça' }).boundingBox())!;
  expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(chatBox.x + 1);
  expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(pieceBox.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/writing-desk/history-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Recolher conversas' }).click();
  await expect(sidebar).not.toBeVisible();
  await page.getByRole('button', { name: 'Mostrar conversas' }).click();
  await open.click();
  await expect(page).toHaveURL(new RegExp(`executionId=${run.id}`));
  // Excluir é reversível: sai do histórico na hora e o aviso oferece "Desfazer".
  await sidebar.getByRole('button', { name: `Excluir do histórico: ${title}`, exact: true }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Conversa excluída do histórico' });
  await expect(notice).toContainText(title);
  await expect(open).toHaveCount(0);
  await notice.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(open).toBeVisible();
  await sidebar.getByRole('button', { name: `Excluir do histórico: ${title}`, exact: true }).click();
  await expect(open).toHaveCount(0);
  await page.reload();
  await expect(open).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Conversas excluídas', exact: true }).click();
  await sidebar.getByRole('button', { name: `Restaurar: ${title}`, exact: true }).click();
  await sidebar.getByRole('button', { name: 'Voltar às conversas' }).click();
  await expect(open).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).not.toBeVisible();
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  const mobileHistory = page.getByRole('dialog', { name: 'Conversas', exact: true });
  await expect(mobileHistory.getByRole('button', { name: title, exact: true })).toBeVisible();
  await expect(mobileHistory.getByRole('button', { name: 'Nova conversa' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
});

test('edição local, exportação, versão salva e pedido contextual na mesma mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toContainText('Rascunhos');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toContainText('Revisão');
  const response = await page.request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Caso da mesa integrada' },
  });
  const matter = await response.json();
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await desk.getByLabel('Título da peça').fill('Petição de teste local');
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Texto editado localmente, sem chamada à IA.');
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toHaveCount(0);
  await desk.getByLabel('Exportar peça').click();
  const download = page.waitForEvent('download');
  await desk.getByRole('button', { name: /Word/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  await desk.getByLabel('Exportar peça').click();
  const popup = page.waitForEvent('popup');
  await desk.getByRole('button', { name: /PDF/ }).click();
  const print = await popup;
  await expect(print.getByText('Texto editado localmente, sem chamada à IA.')).toBeVisible();
  await expect(print.getByRole('heading', { name: 'Petição de teste local' })).toBeVisible();
  await print.close();
  // Choosing a case must preserve the locally authored text.
  await page.getByRole('button', { name: 'Recolher peça' }).click();
  await expect(desk).not.toBeVisible();
  await page.getByRole('button', { name: 'Abrir peça', exact: true }).click();
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    'Texto editado localmente, sem chamada à IA.',
  );
  await desk.getByText('Abrir peça', { exact: true }).click();
  await desk.getByLabel('Caso da peça').selectOption(matter.id);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    'Texto editado localmente, sem chamada à IA.',
  );
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByText('Salvo', { exact: true })).toBeVisible();
  const listing = await (await page.request.get(api + '/api/v2/matters/' + matter.id + '/drafts', { headers })).json();
  const draft = { draft: listing.items[0] };
  await desk.getByText('Peça aberta', { exact: true }).click();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Relato sintético alterado na mesa.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByText('Salvo', { exact: true })).toBeVisible();
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${draft.draft.id}`, { headers })
  ).json();
  expect(details.currentVersion.sections[0].content).toBe('Relato sintético alterado na mesa.');
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Melhore a clareza dos fatos desta peça');
  await page.screenshot({ path: 'test-results/writing-desk/desktop.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).include('[data-writing-desk]').analyze();
  expect(accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.matterId).toBe(matter.id);
  expect(sent.context.draft).toEqual({ draftId: draft.draft.id, versionId: details.currentVersion.version.id });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Peça', exact: true }).click();
  await expect(desk).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/writing-desk/mobile.png', fullPage: true });
});

test('entrega abre ao lado, mantém edição ao navegar e aceita links antigos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Caso da entrega integrada' } })
  ).json();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Redigir minuta para revisão editorial');
  await page.getByRole('button', { name: /^(Sem caso|Caso:)/ }).click();
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill(
      (await page.getByLabel('O que você precisa fazer?', { exact: true }).inputValue()) +
        '\n\n' +
        'Relato sintético sujeito a conferência.',
    );
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).not.toHaveValue('');
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  const run = await (
    await page.request.get(`${api}/api/agentic/executions/${new URL(page.url()).searchParams.get('executionId')}`, {
      headers,
    })
  ).json();
  const delivery = await (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(run.deliveryIds[0])}`, { headers })
  ).json();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Alteração local preservada.');
  await expect(page.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Casos', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Mesa', exact: true })
    .click();
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByText('Salvo', { exact: true })).toBeVisible();
  await page.goto(`/app/rascunhos?matterId=${matter.id}&draftId=${delivery.draftId}`);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await expect(page).toHaveURL(/\/app\/trabalho/);
  await page.goto('/app/revisao');
  await expect(page.getByRole('region', { name: 'Conferências do caso' })).toHaveCount(0);
});

test('excluir peça salva é reversível: sai da lista, o aviso desfaz e nada é apagado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Caso da peça excluída' } })
  ).json();
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await desk.getByLabel('Título da peça').fill('Peça que será excluída');
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Texto que precisa sobreviver à exclusão.');
  await desk.getByText('Abrir peça', { exact: true }).click();
  await desk.getByLabel('Caso da peça').selectOption(matter.id);
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByText('Salvo', { exact: true })).toBeVisible();
  const list = async (query = '') =>
    (await (await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts${query}`, { headers })).json()).items;
  const [saved] = await list();
  expect(saved.title).toBe('Peça que será excluída');

  // Com edição não salva, excluir fica indisponível: nada se perde.
  const archive = desk.getByRole('button', { name: 'Excluir peça', exact: true });
  const openMenu = async () => {
    if (!(await archive.isVisible())) await desk.getByText('Peça aberta', { exact: true }).click();
  };
  await openMenu();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Edição ainda não salva.');
  await expect(archive).toBeDisabled();
  await expect(desk.getByText('Salve ou descarte a edição antes de excluir.')).toBeVisible();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Texto que precisa sobreviver à exclusão.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByText('Salvo', { exact: true })).toBeVisible();

  await openMenu();
  await archive.click();
  const notice = page.getByRole('status').filter({ hasText: 'Peça excluída: Peça que será excluída' });
  await expect(notice).toBeVisible();
  expect(await list()).toEqual([]);
  expect((await list('?archived=true')).map((item: { id: string }) => item.id)).toEqual([saved.id]);

  await notice.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect((await list()).map((item: { id: string }) => item.id)).toEqual([saved.id]);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    'Texto que precisa sobreviver à exclusão.',
  );
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${saved.id}`, { headers })
  ).json();
  expect(details.currentVersion.sections[0].content).toBe('Texto que precisa sobreviver à exclusão.');
});
