import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const quote = {
  currency: 'BRL',
  policyVersion: 'commercial-test-v1',
  minCostCents: 50,
  maxCostCents: 500,
  availableCents: 2000,
  dailyLimitCents: 2000,
  monthlyLimitCents: 10000,
};
async function commercial(page: Page) {
  await page.route('**/api/agentic/actions', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), commercial: true, closedPilot: false } });
  });
  await page.route('**/api/agentic/commercial/quote', (route) => route.fulfill({ json: quote }));
  await page.route('**/api/agentic/commercial/executions/*/receipt', (route) =>
    route.fulfill({
      json: { currency: 'BRL', reservedCents: 500, chargedCents: 50, releasedCents: 450, status: 'COMPLETED' },
    }),
  );
}
async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}
async function prepare(page: Page, objective: string) {
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(objective);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
}

test('autoriza preço em reais, preserva retry e mostra comprovante no celular', async ({ page }) => {
  await commercial(page);
  const posted: { body: any; key?: string }[] = [];
  await page.route('**/api/agentic/commercial/executions', async (route) => {
    posted.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    if (posted.length === 1) return route.fulfill({ status: 503, json: { error: 'EXECUTION_UNAVAILABLE' } });
    const { confirmed: _confirmed, policyVersion: _version, ...input } = route.request().postDataJSON();
    const response = await route.fetch({
      url: 'http://127.0.0.1:3301/api/agentic/executions',
      postData: JSON.stringify(input),
    });
    await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await login(page);
  await prepare(page, 'Organizar os fatos sintéticos apresentados');
  const review = page.getByRole('region', { name: 'Autorizar trabalho' });
  await expect(review).toContainText(/Este trabalho custa até R\$\s*5,00/);
  await expect(review).toContainText('O saldo não utilizado será liberado');
  await expect(review).not.toContainText(/USD|gpt-|tokens|framework/i);
  expect(posted).toHaveLength(0);
  const accessibility = await new AxeBuilder({ page }).include('[data-agentic-workspace]').analyze();
  expect(accessibility.violations).toEqual([]);
  await review.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await review.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  expect(posted).toHaveLength(2);
  expect(posted[1]).toEqual(posted[0]);
  expect(posted[0].key).toBeTruthy();
  expect(posted[0].body).toMatchObject({ confirmed: true, policyVersion: quote.policyVersion });
  await page.getByText('Custo deste trabalho', { exact: true }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible();
  await expect(page.locator('dd', { hasText: /R\$\s*0,50/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('resposta e correção exigem autorização nova antes de enviar', async ({ page }) => {
  await commercial(page);
  const requests: { path: string; body: any; key?: string }[] = [];
  await page.route('**/api/agentic/commercial/executions', async (route) => {
    const { confirmed: _confirmed, policyVersion: _version, ...input } = route.request().postDataJSON();
    const response = await route.fetch({
      url: 'http://127.0.0.1:3301/api/agentic/executions',
      postData: JSON.stringify(input),
    });
    await route.fulfill({ response });
  });
  await page.route(/\/api\/agentic\/executions\/[^/]+\/(answers|corrections|continue)$/, async (route) => {
    requests.push({
      path: route.request().url(),
      body: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });
    const { confirmed: _confirmed, policyVersion: _version, ...input } = route.request().postDataJSON();
    const response = await route.fetch({ postData: JSON.stringify(input) });
    await route.fulfill({ response });
  });
  await login(page);
  await prepare(page, 'Analisar PERGUNTA_MULTIPLA');
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await page.getByLabel('Complemento ou outra resposta').fill('Resposta original sintética');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Autorizar trabalho' })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  await page.getByRole('button', { name: 'Corrigir esta resposta' }).last().click();
  await page.getByLabel('Complemento ou outra resposta').fill('Correção sintética');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  expect(requests).toHaveLength(1);
  const correctionResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/corrections'),
  );
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const corrected = await correctionResponse;
  expect(corrected.ok()).toBe(true);
  const correctedExecution = await corrected.json();
  await page.waitForURL((url) => url.searchParams.get('executionId') === correctedExecution.id);
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].body).toMatchObject({ confirmed: true, policyVersion: quote.policyVersion });
  expect(requests[1].body).toMatchObject({ confirmed: true, policyVersion: quote.policyVersion });
  expect(requests[0].key).not.toBe(requests[1].key);
});

test('continuação exige preço confirmado e o processamento permite cancelar', async ({ page }) => {
  await commercial(page);
  const executionId = '26a11266-0000-4000-8000-000000000001';
  const execution = {
    id: executionId,
    objective: 'Trabalho sintético interrompido',
    actionId: null,
    conversationId: executionId,
    matterId: null,
    contextRevision: 1,
    status: 'CANCELLED',
    deliveryIds: [],
    question: null,
    requiresReevaluation: false,
    successorId: null,
    context: { text: '', origin: 'USER', documents: [] },
    messages: [],
  };
  const posts: { kind: string; body: any }[] = [];
  await page.route(`**/api/agentic/executions/${executionId}`, (route) => route.fulfill({ json: execution }));
  await page.route(`**/api/agentic/executions/${executionId}/events?*`, (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: '' }),
  );
  await page.route(`**/api/agentic/executions/${executionId}/continue`, (route) => {
    posts.push({ kind: 'continue', body: route.request().postDataJSON() });
    execution.status = 'RUNNING';
    return route.fulfill({ json: execution });
  });
  await page.route(`**/api/agentic/executions/${executionId}/cancel`, (route) => {
    posts.push({ kind: 'cancel', body: route.request().postDataJSON() });
    execution.status = 'CANCELLED';
    return route.fulfill({ json: execution });
  });
  await login(page);
  await page.goto(`/app/trabalho?executionId=${executionId}`);
  await page.getByRole('button', { name: 'Continuar trabalho', exact: true }).click();
  expect(posts).toHaveLength(0);
  await expect(page.getByRole('region', { name: 'Autorizar trabalho' })).toContainText(/R\$\s*5,00/);
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  expect(posts[0]).toEqual({ kind: 'continue', body: { confirmed: true, policyVersion: quote.policyVersion } });
  const cancellationResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/cancel'),
  );
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await cancellationResponse).ok()).toBe(true);
  await expect(page.getByRole('status', { name: 'Andamento', exact: true })).toHaveText('Processamento interrompido');
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ kind: 'cancel', body: {} });
});

test('saldo insuficiente e preço indisponível impedem novo trabalho', async ({ page }) => {
  await commercial(page);
  await page.route('**/api/agentic/commercial/quote', (route) =>
    route.fulfill({ json: { ...quote, availableCents: 499 } }),
  );
  await login(page);
  await prepare(page, 'Conferir contexto sintético');
  await expect(page.getByRole('button', { name: 'Iniciar trabalho', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Saldo insuficiente');
  await page.route('**/api/agentic/commercial/quote', (route) =>
    route.fulfill({ status: 503, json: { error: 'COMMERCIAL_UNAVAILABLE' } }),
  );
  await page.reload();
  await prepare(page, 'Conferir novamente contexto sintético');
  await expect(page.getByRole('region', { name: 'Autorizar trabalho' })).toContainText(
    'Não foi possível consultar o preço',
  );
  await expect(page.getByRole('button', { name: 'Iniciar trabalho', exact: true })).toHaveCount(0);
});

test('autorização da correção mantém a resposta escolhida e bloqueia outra resposta histórica', async ({ page }) => {
  await commercial(page);
  const executionId = '26a11266-0000-4000-8000-000000000002';
  const question = (id: string) => ({
    id,
    version: 1,
    contextRevision: 1,
    prompt: `Pergunta ${id}`,
    selection: 'free_text',
    options: [],
    allowFreeText: true,
    allowUnknown: false,
    reason: 'Conferir a informação sintética.',
  });
  const execution = {
    id: executionId,
    objective: 'Conferir duas respostas históricas',
    actionId: null,
    conversationId: executionId,
    matterId: null,
    contextRevision: 1,
    status: 'COMPLETED',
    deliveryIds: [],
    question: null,
    requiresReevaluation: false,
    successorId: null,
    context: { text: '', origin: 'USER', documents: [] },
    messages: ['A', 'B'].flatMap((id) => [
      { id: `q-${id}`, role: 'assistant', createdAt: '', question: question(id) },
      {
        id: `a-${id}`,
        role: 'user',
        createdAt: '',
        answer: {
          questionId: id,
          questionVersion: 1,
          contextRevision: 1,
          selectedOptionIds: [],
          freeText: `Resposta ${id}`,
        },
      },
    ]),
  };
  const posts: any[] = [];
  await page.route(`**/api/agentic/executions/${executionId}`, (route) => route.fulfill({ json: execution }));
  await page.route(`**/api/agentic/executions/${executionId}/events?*`, (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: '' }),
  );
  await page.route(`**/api/agentic/executions/${executionId}/corrections`, (route) => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: execution });
  });
  await login(page);
  await page.goto(`/app/trabalho?executionId=${executionId}`);
  const corrections = page.getByRole('button', { name: 'Corrigir esta resposta', exact: true });
  await expect(corrections).toHaveCount(2);
  await corrections.first().click();
  await page.getByLabel('Sua resposta', { exact: true }).fill('Correção autorizada de A');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Autorizar trabalho' })).toBeVisible();
  await expect(corrections.first()).toBeDisabled();
  await expect(corrections.last()).toBeDisabled();
  expect(posts).toHaveLength(0);
  await expect(page.getByRole('group', { name: 'Pergunta A', exact: true })).toBeVisible();
  const correctionResponse = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/corrections'),
  );
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  expect((await correctionResponse).ok()).toBe(true);
  await expect(page.getByRole('region', { name: 'Autorizar trabalho' })).toHaveCount(0);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    questionId: 'A',
    freeText: 'Correção autorizada de A',
    confirmed: true,
    policyVersion: quote.policyVersion,
  });
});
