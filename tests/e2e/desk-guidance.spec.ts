import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openDesk(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

const help = (page: Page) => page.getByRole('button', { name: 'Me ajude a começar' });
const question = (page: Page) => page.getByRole('region', { name: 'Pergunta do pedido' });
const summary = (page: Page) => page.getByRole('region', { name: 'Resumo do pedido' });

async function expectAlignedOptions(page: Page) {
  const positions = await question(page)
    .getByRole('radio')
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const { top, width, height } = input.closest('label')!.getBoundingClientRect();
        return { top, width, height };
      }),
    );
  expect(positions[0].top).toBe(positions[1].top);
  expect(Math.abs(positions[0].width - positions[1].width)).toBeLessThan(1);
  expect(positions.every(({ height }) => height >= 44)).toBe(true);
}

async function choose(page: Page, option: string) {
  await question(page).getByRole('radio', { name: option, exact: true }).check();
  await question(page)
    .getByRole('button', { name: /^(Continuar|Salvar alteração)$/ })
    .click();
}

test('pergunta por vez, correção na Mesa e retomada com contexto da conversa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await openDesk(page);
  await expect(help(page)).toBeVisible();
  await page.screenshot({ path: 'test-results/desk-guidance/01-desktop-inicio.png' });
  await help(page).click();
  await expect(question(page)).toBeVisible();
  await expectAlignedOptions(page);
  expect(await question(page).evaluate((surface) => getComputedStyle(surface).borderTopWidth)).toBe('0px');
  await expect(question(page).locator('legend')).toBeFocused();

  const penal = question(page).getByRole('radio', { name: 'Penal', exact: true });
  await page.keyboard.press('Tab');
  await expect(penal).toBeFocused();
  await page.keyboard.press('Space');
  await expect(penal).toBeChecked();
  await page.screenshot({ path: 'test-results/desk-guidance/02-desktop-area.png', animations: 'disabled' });
  await expect(question(page).locator('legend')).toHaveText('Em qual área você precisa trabalhar?');
  await question(page).getByRole('button', { name: 'Continuar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(summary(page)).toContainText('Penal');
  await choose(page, 'Elaborar uma peça');
  await choose(page, 'Resposta à acusação');
  await expect(question(page)).toHaveCount(0);
  await expect(summary(page)).toContainText('Resposta à acusação');
  const original = new URL(page.url());
  expect(original.searchParams.get('conversationId')).toBeTruthy();
  await page.reload();
  await expect(summary(page)).toContainText('Resposta à acusação');
  await summary(page).getByRole('button', { name: 'Alterar', exact: true }).click();
  await page.screenshot({ path: 'test-results/desk-guidance/03-desktop-edicao.png' });
  await summary(page).getByRole('button', { name: 'Alterar área' }).click();
  await expect(question(page).getByRole('radio', { name: 'Penal', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toHaveCount(0);
  await choose(page, 'Cível');
  await expect(summary(page)).toContainText('Cível');
  await expect(summary(page)).not.toContainText('Resposta à acusação');
  await expect(question(page).getByRole('radio', { name: 'Contestação' })).toBeVisible();
  await choose(page, 'Contestação');
  await expect(summary(page)).toContainText('Contestação');
  const objective = 'Organize a contestação a partir do relato que vou apresentar.';
  const message = page.getByRole('textbox', { name: 'O que você precisa fazer?' });
  await message.fill(objective);
  await expect(message).toBeFocused();
  expect(await message.evaluate((field) => getComputedStyle(field).outlineColor)).toBe('rgba(0, 0, 0, 0)');
  expect(
    await page.getByRole('group', { name: 'Mensagem' }).evaluate((group) => getComputedStyle(group).boxShadow),
  ).not.toBe('none');
  await page.screenshot({ path: 'test-results/desk-guidance/04-desktop-resumo.png' });
  expect(new URL(page.url()).searchParams.get('conversationId')).toBe(original.searchParams.get('conversationId'));
  expect(new URL(page.url()).searchParams.get('executionId')).toBeNull();
  const main = page.locator('[data-writing-desk]');
  await expect(main).not.toContainText(/guidanceHash|resolutionHash|skillBinding|create_document/);
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/agentic/executions', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect
    .poll(() => payload)
    .toEqual({
      objective,
      actionId: 'create_document',
      conversationId: original.searchParams.get('conversationId'),
      contextRevision: Number(new URL(page.url()).searchParams.get('contextRevision')),
    });
});

test('resposta tardia da abertura não substitui outra conversa', async ({ page }) => {
  await openDesk(page);
  let release!: () => void;
  let reached!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const accepted = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route('**/api/agentic/guidance', async (route) => {
    const response = await route.fetch();
    reached();
    await hold;
    await route.fulfill({ response });
  });
  await help(page).click();
  await accepted;
  await page
    .getByRole('complementary', { name: 'Histórico de conversas' })
    .getByRole('button', { name: 'Nova conversa', exact: true })
    .click();
  const received = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/agentic/guidance');
  release();
  await (await received).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(new URL(page.url()).searchParams.get('conversationId')).toBeNull();
  await expect(question(page)).toHaveCount(0);
  await expect(help(page)).toBeEnabled();
});

test('atualiza pergunta e resumo quando outra aba respondeu primeiro', async ({ page }) => {
  await openDesk(page);
  await help(page).click();
  await expect(question(page).getByRole('radio', { name: 'Penal', exact: true })).toBeVisible();
  const conversationId = new URL(page.url()).searchParams.get('conversationId');
  const endpoint = `http://127.0.0.1:3311/api/agentic/guidance/${conversationId}`;
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const previous = await (await page.request.get(endpoint, { headers })).json();
  const secondTab = await page.request.post(`${endpoint}/answer`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      questionId: previous.question.id,
      questionVersion: previous.question.version,
      contextRevision: previous.contextRevision,
      selectedOptionIds: ['civel'],
    },
  });
  expect(secondTab.ok()).toBe(true);
  await choose(page, 'Penal');
  await expect(
    page.getByText('O pedido foi atualizado em outra aba. Confira as respostas para continuar.'),
  ).toBeVisible();
  await expect(summary(page)).toContainText('Cível');
  await expect(question(page).getByRole('radio', { name: 'Elaborar uma peça' })).toBeVisible();
});

test('celular conserva a peça até o envio com a orientação concluída', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDesk(page);
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Mesa da peça' });
  const draft = editor.getByLabel('Texto da seção 1', { exact: true });
  await draft.fill('Edição local preservada enquanto defino o pedido.');
  await page.getByRole('button', { name: 'Conversa', exact: true }).click();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/executions'))
      sent.push(request.url());
  });
  await help(page).click();
  await expect(question(page)).toBeVisible();
  await expectAlignedOptions(page);
  await question(page).getByRole('radio', { name: 'Não sei', exact: true }).check();
  const next = question(page).getByRole('button', { name: 'Continuar', exact: true });
  await expect(next).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'test-results/desk-guidance/05-mobile-area.png' });
  await next.click();
  await question(page).getByRole('button', { name: 'Responder com texto' }).click();
  await question(page)
    .getByRole('textbox', { name: 'Sua resposta' })
    .fill('Preciso conferir os pontos da peça aberta.');
  await question(page).getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(summary(page)).toContainText('Área a definir');
  await page.getByText('Respostas anteriores', { exact: true }).click();
  await expect(
    page.getByRole('list').getByText('Preciso conferir os pontos da peça aberta.', { exact: true }),
  ).toBeVisible();
  await page.getByText('Respostas anteriores', { exact: true }).click();
  await page.screenshot({ path: 'test-results/desk-guidance/06-mobile-resumo.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Peça', exact: true }).click();
  await expect(draft).toHaveValue('Edição local preservada enquanto defino o pedido.');
  expect(sent).toEqual([]);
  await page.getByRole('button', { name: 'Conversa', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'O que você precisa fazer?' })).toHaveValue(
    'Preciso conferir os pontos da peça aberta.',
  );
  const guided = new URL(page.url());
  await page.route('**/api/agentic/executions', (route) =>
    route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } }),
  );
  const submitted = page.waitForRequest(
    (request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/executions'),
  );
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    objective: 'Preciso conferir os pontos da peça aberta.',
    conversationId: guided.searchParams.get('conversationId'),
    contextRevision: Number(guided.searchParams.get('contextRevision')),
    context: { text: expect.stringContaining('Edição local preservada enquanto defino o pedido.'), documents: [] },
  });
});
