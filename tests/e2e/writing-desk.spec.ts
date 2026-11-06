import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
  const created = await page.request.post(api + '/api/agentic/executions', {
    headers: { ...headers, 'Idempotency-Key': 'history-sidebar' },
    data: {
      objective: 'Conversa para conferir a lateral',
      context: { text: 'Contexto sintético local', origin: 'USER', documents: [] },
    },
  });
  expect(created.ok()).toBe(true);
  const run = await created.json();
  await page.reload();
  const sidebar = page.getByRole('complementary', { name: 'Histórico de conversas' });
  const open = sidebar.getByRole('button', { name: /^Conversa para conferir a lateral/ });
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
  await sidebar.getByRole('button', { name: /^Excluir do histórico: Conversa para conferir/ }).click();
  const confirmation = page.getByRole('dialog', { name: 'Excluir conversa do histórico?' });
  await confirmation.getByRole('button', { name: 'Excluir do histórico', exact: true }).click();
  await expect(open).toHaveCount(0);
  await page.reload();
  await expect(open).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Conversas excluídas', exact: true }).click();
  await sidebar.getByRole('button', { name: /^Restaurar: Conversa para conferir/ }).click();
  await sidebar.getByRole('button', { name: 'Voltar às conversas' }).click();
  await expect(open).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).not.toBeVisible();
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  const mobileHistory = page.getByRole('dialog', { name: 'Conversas', exact: true });
  await expect(mobileHistory.getByRole('button', { name: /^Conversa para conferir/ })).toBeVisible();
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
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeDisabled();
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
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  const listing = await (await page.request.get(api + '/api/v2/matters/' + matter.id + '/drafts', { headers })).json();
  const draft = { draft: listing.items[0] };
  await desk.getByText('Peça aberta', { exact: true }).click();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Relato sintético alterado na mesa.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${draft.draft.id}`, { headers })
  ).json();
  expect(details.currentVersion.sections[0].content).toBe('Relato sintético alterado na mesa.');
  await desk.getByRole('button', { name: 'Pedir ajuste' }).click();
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(/Na peça aberta/);
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
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
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
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  await page.goto(`/app/rascunhos?matterId=${matter.id}&draftId=${delivery.draftId}`);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await expect(page).toHaveURL(/\/app\/trabalho/);
  await page.goto('/app/revisao');
  await expect(page.getByRole('dialog', { name: 'Conferências do caso' })).toBeVisible();
});
