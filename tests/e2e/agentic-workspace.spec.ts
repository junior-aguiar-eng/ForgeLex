import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301',
  headers = { authorization: 'Bearer phase7-e2e-access-token' };

test('piloto fechado mostra USD e exige novo consentimento ao mudar caso ou limite; retry mantém chave', async ({
  page,
}) => {
  const posted: { body: any; key?: string }[] = [];
  await page.route('**/api/agentic/actions', (route) =>
    route.fulfill({ json: { available: true, closedPilot: true, actions: [] } }),
  );
  await page.route('**/api/agentic/pilot/budget*', (route) =>
    route.fulfill({
      json: {
        currency: 'USD',
        model: 'gpt-6.1-sol',
        ceilingCents: 500,
        availableCents: 441,
        settledCents: 55,
        provisionedCents: 4,
        escrowCents: 0,
        reconciliationRequired: false,
        invoiceReconciled: false,
        execution: null,
        examples: [
          { id: 'T6-MIN', objective: 'Responda apenas OK.' },
          { id: 'T6-CONTEXT', objective: 'Compare relatos sintéticos.' },
        ],
      },
    }),
  );
  await page.route('**/api/agentic/pilot/executions', async (route) => {
    posted.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    await route.fulfill({ status: 503, json: { error: 'CLOSED_PILOT_UNAVAILABLE', message: 'Falha simulada local.' } });
  });
  await login(page);
  await page.setViewportSize({ width: 320, height: 900 });
  const panel = page.getByRole('region', { name: 'Piloto fechado e consumo' });
  await expect(panel).toContainText('Teto cumulativo');
  await expect(panel).toContainText('5,00');
  await expect(panel).toContainText('4,41');
  await expect(panel).toContainText('0,04');
  await expect(panel).toContainText('não são uma fatura');
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveCount(0);
  const consent = panel.getByRole('checkbox', { name: /Autorizo o envio/ });
  const start = panel.getByRole('button', { name: 'Executar exemplo sintético' });
  await expect(consent).not.toBeChecked();
  await expect(start).toBeDisabled();
  await consent.check();
  await panel.getByLabel('Limite desta execução (centavos de dólar)').fill('60');
  await expect(consent).not.toBeChecked();
  await consent.check();
  await panel.getByLabel('Exemplo sintético aprovado').selectOption('T6-CONTEXT');
  await expect(consent).not.toBeChecked();
  await consent.check();
  await start.click();
  await expect(panel.getByRole('alert')).toContainText('Não foi possível autorizar o exemplo');
  await start.click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[0].body).toEqual({ caseId: 'T6-CONTEXT', maxCostCents: 60, confirmed: true });
  expect(posted[0].key).toBeTruthy();
  expect(posted[1]).toEqual(posted[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('regressão final: rever pedido preserva texto e finalidade', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Analisar documentos', exact: true }).click();
  await page.getByRole('radio', { name: 'Organizar fatos e provas', exact: true }).check();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Meu pedido original deve permanecer');
  await page.getByRole('button', { name: 'Definir escopo' }).click();
  await page.getByText('Mais opções', { exact: true }).click();
  await page.getByRole('button', { name: 'Rever pedido', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'O que você precisa fazer?', exact: true })).toHaveValue(
    'Meu pedido original deve permanecer',
  );
  await expect(page.getByRole('radio', { name: 'Organizar fatos e provas', exact: true })).toBeChecked();
});
test('regressão final: voltar pela navegação mantém ID e recuperação após recarga', async ({ page }) => {
  await login(page);
  await prepare(page, 'Entender contexto na navegação');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  const original = page.url();
  await page
    .getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByRole('button', { name: 'Rascunhos', exact: true })
    .click();
  await page.getByRole('button', { name: 'Trabalho', exact: true }).click();
  await expect(page).toHaveURL(original);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toHaveCount(1);
});
test('regressão final: entrega corrigida não oculta artefato histórico invalidado', async ({ page }) => {
  await login(page);
  await prepare(page, 'Analisar PERGUNTA_MULTIPLA');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await page.getByLabel('Complemento ou outra resposta').fill('Resposta original');
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  const original = page.url(),
    originalId = new URL(original).searchParams.get('executionId');
  const before = await (await page.request.get(`${api}/api/agentic/executions/${originalId}`, { headers })).json();
  await page.getByText('Pedido e respostas anteriores', { exact: true }).click();
  await page.getByRole('button', { name: 'Corrigir esta resposta' }).last().click();
  await page.getByLabel('Complemento ou outra resposta').fill('Resposta corrigida');
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await page.waitForURL((url) => url.href !== original);
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.goto(original);
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await expect(page).toHaveURL(original);
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toHaveAttribute(
    'data-delivery-id',
    before.deliveryIds[0],
  );
  await expect(page.getByRole('status', { name: 'Reavaliação necessária' })).toContainText('revisão anterior');
});
test('regressão final: resposta tardia não troca URL de outra superfície ou sessão', async ({ page }) => {
  await login(page);
  let release!: () => void, accepted!: () => void;
  const hold = new Promise<void>((r) => {
      release = r;
    }),
    reached = new Promise<void>((r) => {
      accepted = r;
    });
  await page.route('**/api/agentic/executions', async (route) => {
    const response = await route.fetch();
    accepted();
    await hold;
    await route.fulfill({ response });
  });
  await prepare(page, 'Meu comando pendente');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await reached;
  await page
    .getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByRole('button', { name: 'Rascunhos', exact: true })
    .click();
  release();
  await expect(page.locator('[data-agentic-workspace] article')).toHaveCount(1);
  await expect(page).toHaveURL(/\/app\/rascunhos$/);
});
test('regressão final: EOF em pergunta reconecta e observa perda de acesso', async ({ page }) => {
  await login(page);
  await prepare(page, 'Investigar PERGUNTA_MATERIAL');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Organizar informações', exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('executionId'),
    snapshot = await (await page.request.get(`${api}/api/agentic/executions/${id}`, { headers })).json();
  let connections = 0;
  await page.route('**/api/agentic/executions/*/events?*', async (route) => {
    connections++;
    if (connections === 1)
      await route.fulfill({
        contentType: 'text/event-stream',
        body: `id: 2\nevent: status\ndata: ${JSON.stringify({ executionId: id, sequence: 2, type: 'STATUS', payload: { status: 'WAITING_USER' } })}\n\nid: 3\nevent: question\ndata: ${JSON.stringify({ executionId: id, sequence: 3, type: 'QUESTION', payload: { question: snapshot.question } })}\n\n`,
      });
    else
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ACCESS_REVOKED' }),
      });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('acesso');
  expect(connections).toBeGreaterThanOrEqual(2);
});
test('regressão final: erro de acesso no meio do stream reconecta sem declarar acesso revogado', async ({ page }) => {
  await login(page);
  await prepare(page, 'Investigar PERGUNTA_MATERIAL');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Organizar informações', exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('executionId'),
    snapshot = await (await page.request.get(`${api}/api/agentic/executions/${id}`, { headers })).json();
  const frames = `id: 2\nevent: status\ndata: ${JSON.stringify({ executionId: id, sequence: 2, type: 'STATUS', payload: { status: 'WAITING_USER' } })}\n\nid: 3\nevent: question\ndata: ${JSON.stringify({ executionId: id, sequence: 3, type: 'QUESTION', payload: { question: snapshot.question } })}\n\n`;
  let connections = 0;
  await page.route('**/api/agentic/executions/*/events?*', async (route) => {
    connections++;
    await route.fulfill({
      contentType: 'text/event-stream',
      body: connections === 1 ? `${frames}event: error\ndata: {"code":"ACCESS_REVOKED"}\n\n` : frames,
    });
  });
  await page.reload();
  await expect.poll(() => connections).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('radio', { name: 'Organizar informações', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('regressão final: comando de sessão encerrada não publica ID na navegação atual', async ({ page }) => {
  await login(page);
  const before = page.url();
  let release!: () => void, accepted!: () => void, fulfilled!: () => void;
  const hold = new Promise<void>((r) => {
      release = r;
    }),
    reached = new Promise<void>((r) => {
      accepted = r;
    }),
    done = new Promise<void>((r) => {
      fulfilled = r;
    });
  await page.route('**/api/agentic/executions', async (route) => {
    const response = await route.fetch();
    accepted();
    await hold;
    await route.fulfill({ response });
    fulfilled();
  });
  await prepare(page, 'Solicitação da sessão anterior');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await reached;
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  release();
  await done;
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(page).toHaveURL(before);
});
test('regressão final: afirmações mantêm suas fontes e versões disponíveis para conferir', async ({ page }) => {
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Fontes por afirmação' } })
  ).json();
  const source = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers,
      data: {
        title: 'Fonte vinculada',
        originalFilename: 'fonte.txt',
        mimeType: 'text/plain',
        content: 'A parte relata que o serviço não foi entregue.',
      },
    })
  ).json();
  await prepare(page, 'Analisar o documento');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Fonte vinculada', { exact: true }).check();
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.getByText('Fontes da afirmação', { exact: true }).click();
  const refs = page.getByRole('region', { name: 'Fontes da afirmação', exact: true });
  await expect(refs).toContainText(source.version.id);
  await refs.getByRole('button', { name: /Abrir documento/ }).click();
  await expect(page.getByRole('dialog')).toContainText('A parte relata que o serviço não foi entregue.');
});
test('regressão final: falha em outra área preserva trabalho e edição não salva', async ({ page }) => {
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Preservar durante falha de página' } })
  ).json();
  await prepare(page, 'Preciso de uma minuta para conferir', 'Criar uma peça');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  // A late case-list response must use the editor's requested location,
  // even while that retained editor is hidden behind another surface.
  let releaseCases!: () => void, casesReached!: () => void, casesFinished!: () => void;
  const holdCases = new Promise<void>((resolve) => {
    releaseCases = resolve;
  });
  const reachedCases = new Promise<void>((resolve) => {
    casesReached = resolve;
  });
  const finishedCases = new Promise<void>((resolve) => {
    casesFinished = resolve;
  });
  let caseLists = 0;
  await page.route('**/api/v2/matters', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (++caseLists > 1) return route.continue();
    const response = await route.fetch();
    casesReached();
    await holdCases;
    await route.fulfill({ response });
    casesFinished();
  });
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  await reachedCases;
  const input = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await input.fill('Edição preservada durante falha de outra página.');
  await page.route('**/src/screens/ResearchDeskScreen.tsx*', (route) => route.abort('failed'));
  await page
    .getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByRole('button', { name: 'Pesquisa', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir esta página', exact: true })).toBeVisible();
  releaseCases();
  await finishedCases;
  await page.getByRole('button', { name: 'Trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  await expect(input).toHaveValue('Edição preservada durante falha de outra página.');
});
test('revisão seleciona versão da minuta existente e mantém conflito de edição visível', async ({ page }) => {
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Revisão versionada' } })
  ).json();
  const draft = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers,
      data: {
        title: 'Texto humano selecionável',
        sections: [{ ordinal: 0, title: 'Relato', content: 'Versão humana para revisão específica.' }],
      },
    })
  ).json();
  await prepare(page, 'Revisar a versão humana selecionada', 'Revisar um texto');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await expect(page.getByLabel('Minuta do caso (opcional)')).toBeVisible();
  await page.getByLabel('Minuta do caso (opcional)').selectOption(`${draft.draft.id}:${draft.version.id}`);
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.getByText('Contexto do trabalho', { exact: true }).click();
  await page.getByRole('link', { name: 'Abrir minuta selecionada', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await expect(input).toHaveValue('Versão humana para revisão específica.');
  await input.fill('Minha edição ainda não salva.');
  const concurrent = await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts/${draft.draft.id}/versions`, {
    headers,
    data: {
      baseVersionId: draft.version.id,
      title: 'Texto humano selecionável',
      sections: [{ ordinal: 0, title: 'Relato', content: 'Outra versão humana já salva.' }],
    },
  });
  expect(concurrent.ok()).toBe(true);
  const denied = page.waitForResponse(
    (r) => r.url().endsWith(`/drafts/${draft.draft.id}/versions`) && r.request().method() === 'POST',
  );
  await page.getByText('Salvar e exportar', { exact: true }).click();
  await page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click();
  expect((await denied).status()).toBe(409);
  await expect(input).toHaveValue('Minha edição ainda não salva.');
});
async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}
async function prepare(page: Page, text: string, action?: string) {
  if (action) await page.getByRole('button', { name: action, exact: true }).click();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
}
test('quatro ações abrem finalidade sem executar; entrada livre e desconhecimento são explícitos', async ({ page }) => {
  await login(page);
  let starts = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/agentic/executions') && req.method() === 'POST') starts++;
  });
  for (const name of ['Analisar documentos', 'Pesquisar uma questão', 'Criar uma peça', 'Revisar um texto']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect(await page.getByRole('radio').count()).toBeGreaterThan(1);
    expect(await page.getByRole('radio', { checked: true }).count()).toBe(0);
  }
  expect(starts).toBe(0);
  await page.getByRole('radio', { name: 'Ainda não sei', exact: true }).check();
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Investigar a medida apropriada com contexto escrito, sem anexo.');
  await page.getByRole('button', { name: 'Definir escopo' }).click();
  await expect(page.getByRole('button', { name: 'Executar trabalho', exact: true })).toBeVisible();
  expect(starts).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Contexto escrito' })).toBeVisible();
});
test('objetivo, escopo, pergunta, entrega redigida, fonte e edição no editor real', async ({ page }, info) => {
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Trabalho integrado' } })
  ).json();
  const doc = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers,
      data: {
        title: 'Contrato para leitura',
        originalFilename: 'contrato.txt',
        mimeType: 'text/plain',
        content: 'A parte informa que o serviço não foi entregue.',
      },
    })
  ).json();
  await prepare(page, 'Preciso de uma minuta. PERGUNTA_MATERIAL', 'Criar uma peça');
  await page.getByLabel('Contexto escrito').fill('Alegação: serviço não entregue. Não confirmar como fato.');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Contrato para leitura').check();
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Qual a finalidade concreta?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled();
  await page
    .getByLabel('Complemento ou outra resposta')
    .fill('Texto livre fora das opções: preparar requerimento preliminar');
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toContainText(
    'Requer-se a apreciação do pedido',
  );
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toContainText('[DESTINATÁRIO A CONFERIR]');
  await page.reload();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toHaveCount(1);
  await page.getByText('Pedido e respostas anteriores', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Diálogo do trabalho' })).toContainText('Texto livre fora das opções');
  await page.getByText('Fontes e limites', { exact: true }).click();
  await page.getByRole('button', { name: /Abrir documento/ }).click();
  await expect(page.getByRole('dialog')).toContainText('A parte informa que o serviço não foi entregue.');
  await page.getByRole('dialog').press('Escape');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[data-agentic-workspace]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('trabalho-320.png'), fullPage: true });
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  const content = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await expect(content).toHaveValue('[DESTINATÁRIO A CONFERIR]');
  await content.fill('Edição humana ainda não salva');
  await page.getByRole('button', { name: 'Voltar ao trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  await expect(content).toHaveValue('Edição humana ainda não salva');
  await page.getByText('Salvar e exportar', { exact: true }).click();
  await page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click();
  await expect(page.getByText('Há alterações não salvas.', { exact: true })).toHaveCount(0);
  expect(doc.document.id).toBeTruthy();
});
test('recupera execução, preserva contexto na continuação e reavalia resposta corrigida', async ({ page }) => {
  await login(page);
  await prepare(page, 'Analisar o relato PERGUNTA_MULTIPLA', 'Analisar documentos');
  await page.getByLabel('Contexto escrito').fill('Contexto que deve continuar vinculado.');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await page.waitForURL(/executionId=/);
  const firstUrl = page.url();
  await page.reload();
  await page.getByLabel('Organizar informações', { exact: true }).check();
  await page.getByLabel('Identificar lacunas', { exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Organizar informações', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Identificar lacunas', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  expect(page.url()).not.toBe(firstUrl);
  await page.getByText('Pedido e respostas anteriores', { exact: true }).click();
  await page.getByRole('button', { name: 'Corrigir esta resposta' }).last().click();
  await page.getByLabel('Complemento ou outra resposta').fill('Resposta corrigida que exige reavaliação');
  const beforeCorrection = page.url();
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await page.waitForURL((url) => url.href !== beforeCorrection);
  const correctedDelivery = page.getByRole('article', { name: 'Entrega preliminar' });
  await expect(correctedDelivery).toBeVisible();
  await correctedDelivery.getByText('Mais opções', { exact: true }).click();
  await correctedDelivery.getByRole('button', { name: 'Criar peça a partir deste trabalho', exact: true }).click();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Redigir a partir da análise anterior');
  await page.getByRole('button', { name: 'Definir escopo' }).click();
  await expect(page.getByLabel('Contexto escrito')).toHaveValue('Contexto que deve continuar vinculado.');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toContainText(
    'Requer-se a apreciação do pedido',
  );
});
test('falta de orçamento e indisponibilidade preservam o texto e mostram motivo', async ({ page }) => {
  await login(page);
  await prepare(page, 'Pesquisar SEM_ORCAMENTO', 'Pesquisar uma questão');
  await page.getByLabel('Contexto escrito').fill('Texto a preservar');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Andamento' })).toContainText('orçamento');
  await page.getByText('Contexto do trabalho', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Contexto do trabalho' })).toContainText('Texto a preservar');
});
test('teclado, resposta desconhecida e documento revogado mantêm pedido e limites', async ({ page }) => {
  await login(page);
  await prepare(page, 'Investigar PERGUNTA_MATERIAL', 'Analisar documentos');
  await page.getByLabel('Contexto escrito').fill('Relato próprio a preservar');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  const option = page.getByRole('radio', { name: 'Organizar informações', exact: true });
  await option.focus();
  await page.keyboard.press('Space');
  await expect(option).toBeChecked();
  await page.getByLabel('Ainda não sei', { exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Enviar resposta' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  await page.getByText('Pedido e respostas anteriores', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Diálogo do trabalho' })).toContainText('Ainda não sei');
  // A second independent task uses the same authenticated local API, with no browser mocks.
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Escopo revogável' } })
  ).json();
  const source = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers,
      data: {
        title: 'Documento revogável',
        originalFilename: 'fonte.txt',
        mimeType: 'text/plain',
        content: 'Fonte temporária para teste de revogação.',
      },
    })
  ).json();
  await page.goto('/app/trabalho');
  await prepare(page, 'Investigar PERGUNTA_MATERIAL');
  await page.getByLabel('Contexto escrito').fill('Meu relato permanece');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Documento revogável', { exact: true }).check();
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Organizar informações', exact: true })).toBeVisible();
  const current = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/documents/${source.document.id}`, { headers })
  ).json();
  const revoked = await page.request.post(
    `${api}/api/v2/matters/${matter.id}/documents/${source.document.id}/archive`,
    { headers, data: { expectedLifecycleRevision: current.document.lifecycleRevision } },
  );
  expect(revoked.ok()).toBe(true);
  await expect(page.getByRole('alert')).toContainText('acesso');
  await page.getByText('Contexto do trabalho', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Contexto do trabalho' })).toContainText('Meu relato permanece');
});
test('texto produzido sem caso entra no editor e só persiste após vinculação explícita', async ({ page }) => {
  await login(page);
  await prepare(page, 'Preciso de uma minuta preliminar sem caso cadastrado', 'Criar uma peça');
  await page.getByLabel('Contexto escrito').fill('Contexto sintético da solicitação');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vincular entrega ao caso' })).toContainText('Escolha um caso');
  await page.getByLabel('Novo caso para esta minuta').fill('Caso escolhido explicitamente');
  await page.getByRole('button', { name: 'Criar caso e vincular minuta' }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })).toHaveValue(
    '[DESTINATÁRIO A CONFERIR]',
  );
  await page.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await page.getByText('Salvar e exportar', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar nova versão', exact: true })).toBeVisible();
});
test('suporte insuficiente entrega lacunas sem apresentar outline como minuta', async ({ page }) => {
  await login(page);
  await prepare(page, 'Preciso de uma minuta SEM_SUPORTE', 'Criar uma peça');
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toContainText('Análise de lacunas e limites');
  await expect(page.getByRole('link', { name: 'Editar minuta', exact: true })).toHaveCount(0);
});
test('compara conferir fonte e editar a mesma minuta nos dois percursos com fontes reais da fixture', async ({
  page,
}, info) => {
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Comparação verificável' } })
  ).json();
  const source = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
      headers,
      data: {
        title: 'Fonte comparável',
        originalFilename: 'comparacao.txt',
        mimeType: 'text/plain',
        content: 'Fonte sintética comum aos dois percursos.',
      },
    })
  ).json();
  await prepare(page, 'Preciso de uma minuta para comparação', 'Criar uma peça');
  await page.getByLabel('Contexto escrito').fill('Comparar conferência e edição');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Fonte comparável').check();
  await page.getByRole('button', { name: 'Executar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Entrega preliminar' })).toBeVisible();
  const workUrl = page.url();
  const execution = await (
    await page.request.get(`${api}/api/agentic/executions/${new URL(workUrl).searchParams.get('executionId')}`, {
      headers,
    })
  ).json();
  const delivery = await (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(execution.deliveryIds[0])}`, { headers })
  ).json();
  const clone = await (
    await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
      headers,
      data: {
        title: 'Minuta comparável anterior',
        sections: delivery.delivery.document.sections.map((s: any, ordinal: number) => ({
          ordinal,
          title: s.title,
          content: s.content,
        })),
      },
    })
  ).json();
  const benchmark: Record<string, unknown> = {
    task: 'Conferir a mesma fonte e salvar a mesma revisão em minutas com texto inicial idêntico',
    sourceDocumentId: source.document.id,
    sourceVersionId: source.version.id,
    priorDraftId: clone.draft.id,
    nativeDraftId: delivery.draftId,
    limitations:
      'Fixture determinística; mede somente o subpercurso documental, sem avaliação de qualidade jurídica ou redução de tempo humano.',
  };
  for (const mode of ['anterior', 'trabalho']) {
    await page.goto(mode === 'anterior' ? '/app' : workUrl);
    let interventions = 0,
      screens = 0;
    const start = Date.now();
    const step = async (fn: () => Promise<unknown>) => {
      const before = new URL(page.url()).pathname;
      await fn();
      interventions++;
      if (before !== new URL(page.url()).pathname) screens++;
    };
    if (mode === 'anterior') {
      await step(() => page.getByRole('button', { name: 'Casos', exact: true }).click());
      await step(() => page.getByRole('button', { name: new RegExp('^' + matter.title) }).click());
      await step(() => page.getByRole('button', { name: 'Abrir documento: Fonte comparável', exact: true }).click());
    } else {
      await step(() => page.getByText('Fontes e limites', { exact: true }).click());
      await step(() => page.getByRole('button', { name: /Abrir documento/ }).click());
    }
    await expect(page.getByRole('dialog')).toContainText('Fonte sintética comum aos dois percursos.');
    await step(() => page.getByRole('dialog').press('Escape'));
    if (mode === 'anterior') {
      await step(() =>
        page
          .getByRole('navigation', { name: 'Navegação principal', exact: true })
          .getByRole('button', { name: 'Rascunhos', exact: true })
          .click(),
      );
      await step(() => page.getByRole('button', { name: new RegExp('^' + matter.title) }).click());
      await step(() => page.getByRole('button', { name: /Minuta comparável anterior/ }).click());
    } else await step(() => page.getByRole('link', { name: 'Editar minuta', exact: true }).click());
    await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })).toHaveValue(
      '[DESTINATÁRIO A CONFERIR]',
    );
    await step(() =>
      page
        .getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })
        .fill('Revisão humana idêntica nos dois percursos.'),
    );
    await step(() => page.getByText('Salvar e exportar', { exact: true }).click());
    const saved = page.waitForResponse((r) => /\/versions$/.test(r.url()) && r.request().method() === 'POST');
    await step(() => page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click());
    expect((await saved).ok()).toBe(true);
    benchmark[mode] = {
      interventions,
      screenChanges: screens,
      elapsedMs: Date.now() - start,
      sourceRead: true,
      saved: true,
    };
  }
  await info.attach('comparacao-documental.json', {
    body: JSON.stringify(benchmark, null, 2),
    contentType: 'application/json',
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(info.outputPath('comparacao-documental.json'), JSON.stringify(benchmark, null, 2));
});
