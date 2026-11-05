import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301',
  headers = { authorization: 'Bearer phase7-e2e-access-token' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function setup(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Revisão editorial sintética' } })
  ).json();
  await page.goto('/app/trabalho');
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Redigir minuta para revisão editorial');
  await page.getByRole('button', { name: /^(Sem caso|Caso:)/ }).click();
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Contexto escrito').fill('Relato sintético sujeito a conferência.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  const run = await (
    await page.request.get(`${api}/api/agentic/executions/${new URL(page.url()).searchParams.get('executionId')}`, {
      headers,
    })
  ).json();
  const delivery = await (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(run.deliveryIds[0])}`, { headers })
  ).json();
  const target = { draftId: delivery.draftId, versionId: delivery.versionId };
  const path = `${api}/api/agentic/deliveries/${encodeURIComponent(delivery.id)}`;
  const context = await (
    await page.request.get(`${path}/editorial-context?${new URLSearchParams(target)}`, { headers })
  ).json();
  const { document, sources: _s, claims: _c, requirements: _r, findings: _f, supportAudit: _a, ...envelope } = context;
  const section = document.sections[0];
  const proposal = {
    ...envelope,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [
      {
        id: 'edit',
        category: 'CLARITY',
        sectionIndex: 0,
        sectionHash: hash(section.content),
        start: 0,
        end: section.content.length,
        before: section.content,
        after: '[DESTINATÁRIO A CONFERIR ANTES DO USO]',
        reason: 'Tornar explícita a conferência.',
        sourceIds: section.sourceIds,
      },
    ],
    substantiveSuggestions: [],
    limitations: ['Proposta sintética; conferir cabimento.'],
  };
  return { proposal, path, delivery, target };
}
const upload = (page: Page, proposal: unknown) =>
  page.getByLabel('Arquivo da proposta editorial').setInputFiles({
    name: 'proposta.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proposal)),
  });

test('revisão comercial cobra conclusão sem mudanças e recupera recibo sem novo envio', async ({ page }) => {
  const f = await setup(page);
  let starts = 0;
  const result = {
    commandId: 'synthetic-command',
    status: 'COMPLETED',
    receipt: { reservedCents: 500, chargedCents: 50, releasedCents: 450, status: 'COMPLETED' },
    result: { proposal: { ...f.proposal, changes: [] } },
  };
  await page.route(`${f.path}/editorial-proposals/generation?*`, (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: 'COMMERCIAL',
        currency: 'BRL',
        policyVersion: 'commercial-brl-2026-10-30-v1',
        maxCostCents: 500,
        minCostCents: 50,
      },
    }),
  );
  await page.route(`${f.path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'POST') {
      starts++;
      expect(route.request().postDataJSON()).toMatchObject({
        confirmed: true,
        policyVersion: 'commercial-brl-2026-10-30-v1',
      });
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      await route.abort(); // Server accepted; its response was lost.
    } else await route.fulfill({ json: { command: starts ? result : null } });
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await expect(dialog.getByText(/até R\$\s*5,00/)).toBeVisible();
  const start = dialog.getByRole('button', { name: 'Iniciar revisão', exact: true });
  await expect(start).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Autorizo a revisão/ }).check();
  await start.click();
  await expect(dialog.getByRole('button', { name: 'Conferir andamento e recibo', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Conferir andamento e recibo', exact: true }).click();
  await expect(dialog.getByText(/Cobrado: R\$\s*0,50/)).toBeVisible();
  await expect(dialog.getByText('Revisão concluída sem sugestões de alteração.')).toBeVisible();
  expect(starts).toBe(1);
  await expect(dialog.getByText(/US\$/)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog.getByText(/Cobrado: R\$\s*0,50/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Iniciar revisão', exact: true })).toHaveCount(0);
  expect(starts).toBe(1);
});

test('nova revisão após falha exige confirmação e uma nova chave, sem repetição automática', async ({ page }) => {
  const f = await setup(page);
  const keys: string[] = [];
  await page.route(`${f.path}/editorial-proposals/generation?*`, (route) =>
    route.fulfill({
      json: { enabled: true, mode: 'COMMERCIAL', policyVersion: 'commercial-brl-2026-10-30-v1', maxCostCents: 500 },
    }),
  );
  await page.route(`${f.path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { command: null } });
    keys.push(route.request().headers()['idempotency-key']);
    await route.fulfill({
      json: {
        commandId: `attempt-${keys.length}`,
        status: 'FAILED',
        receipt: { reservedCents: 500, chargedCents: 0, releasedCents: 500, status: 'FAILED' },
      },
    });
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await dialog.getByRole('checkbox', { name: /Autorizo a revisão/ }).check();
  await dialog.getByRole('button', { name: 'Iniciar revisão', exact: true }).click();
  await expect(dialog.getByText('Não foi possível concluir a revisão.')).toBeVisible();
  expect(keys).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Solicitar nova revisão', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Iniciar revisão', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Autorizo a revisão/ }).check();
  await dialog.getByRole('button', { name: 'Iniciar revisão', exact: true }).click();
  await expect(dialog.getByText('Não foi possível concluir a revisão.')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

test('pedido ainda não localizado preserva a chave mesmo com revisão antiga cancelada', async ({ page }) => {
  const f = await setup(page);
  const storageKey = `forgelex:editorial:${new URL(f.path).pathname}/editorial-proposals:${f.target.draftId}:${f.target.versionId}`;
  await page.evaluate((key) => sessionStorage.setItem(key, 'pending-request'), storageKey);
  let submitted: string | undefined;
  await page.route(`${f.path}/editorial-proposals/generation?*`, (route) =>
    route.fulfill({
      json: { enabled: true, mode: 'COMMERCIAL', policyVersion: 'commercial-brl-2026-10-30-v1', maxCostCents: 500 },
    }),
  );
  await page.route(`${f.path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().headers()['idempotency-key'];
      return route.fulfill({ json: { commandId: 'new', status: 'QUEUED' } });
    }
    return route.fulfill({
      json: {
        command: new URL(route.request().url()).searchParams.has('requestId')
          ? null
          : {
              commandId: 'old',
              status: 'CANCELLED',
              receipt: { status: 'CANCELLED', reservedCents: 500, chargedCents: 0, releasedCents: 500 },
            },
      },
    });
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await dialog.getByRole('checkbox', { name: /Autorizo a revisão/ }).check();
  await dialog.getByRole('button', { name: 'Iniciar revisão', exact: true }).click();
  await expect(dialog.getByText('Revisão ainda não iniciada. Nenhum saldo foi reservado.')).toBeVisible();
  expect(submitted).toBe('pending-request');
});

test('entrega revisada separa correções e lacunas sem expor IDs ou auditoria técnica na mesa', async ({ page }) => {
  const f = await setup(page);
  const sourceId = 'source-internal-v9';
  await page.route(f.path, (route) =>
    route.fulfill({
      json: {
        ...f.delivery,
        delivery: {
          ...f.delivery.delivery,
          action: 'review_text',
          document: undefined,
          issues: [{ id: 'issue-private', statement: 'O documento identifica o crédito?', sourceIds: [sourceId] }],
          claims: [
            {
              id: 'claim-private',
              classification: 'DOCUMENT_RECORD',
              statement: 'Pagamento: não informado.',
              sourceIds: [sourceId],
            },
          ],
          requirements: [
            {
              id: 'requirement-private',
              kind: 'EDITORIAL',
              statement: 'Retirar afirmação de quitação.',
              verified: false,
              sourceIds: [sourceId],
            },
          ],
          findings: [],
          sources: [{ id: sourceId, kind: 'DOCUMENT' }],
          review: {
            version: 1,
            questions: [
              {
                prompt: 'Qual é a pretensão material?',
                reason: 'A finalidade não foi informada.',
                sourceIds: [sourceId],
              },
            ],
            documentAssessments: [
              {
                sourceId,
                aspects: [{ aspect: 'PARTIES', status: 'NOT_PROVIDED' }],
                conclusion: 'Não basta para vincular crédito a devedor identificado.',
              },
            ],
            integrityAlerts: [
              {
                kind: 'EMBEDDED_INSTRUCTION',
                statement: 'Conferir a origem do documento e do rascunho.',
                sourceIds: [sourceId],
              },
            ],
            technicalFindings: [{ statement: 'TECHNICAL_PRIVATE' }],
          },
        },
      },
    }),
  );
  await page.reload();
  const article = page.getByRole('article', { name: 'Resultado do trabalho' });
  for (const text of [
    'Questões',
    'Registro documental',
    'Correções propostas',
    'Perguntas e lacunas',
    'Aptidão dos documentos',
    'Integridade dos documentos',
  ])
    await expect(article).toContainText(text);
  await expect(article).not.toContainText(/claim-private|source-internal-v9|TECHNICAL_PRIVATE/);
  await expect(article.locator('p').filter({ hasText: 'Retirar afirmação de quitação.' })).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});

test('geração exige confirmação de custo e apenas apresenta proposta para revisão', async ({ page }) => {
  const f = await setup(page);
  let calls = 0;
  await page.route('**/editorial-proposals/generation?*', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: 'REAL',
        maxCostUsd: 0.25,
      },
    }),
  );
  await page.route('**/editorial-proposals/generate', (route) => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ ...f.target, confirmed: true });
    return route.fulfill({ json: { mode: 'REAL', profileVersion: '1.0.0', proposal: f.proposal } });
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  const generate = dialog.getByRole('button', { name: 'Gerar proposta editorial', exact: true });
  await expect(generate).toBeDisabled();
  expect(calls).toBe(0);
  await dialog.getByRole('checkbox', { name: /Autorizo gerar uma proposta/ }).check();
  await generate.click();
  await expect(dialog.getByRole('combobox', { name: 'Decisão 1', exact: true })).toBeVisible();
  expect(calls).toBe(1);
  const review = await (
    await page.request.get(`${f.path}/editorial-review?${new URLSearchParams(f.target)}`, { headers })
  ).json();
  expect(review.history).toEqual([]);
  expect(review.application).toBeUndefined();
  await expect(generate).toBeDisabled();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
});

test('resposta perdida na geração não dispara repetição ao reabrir o diálogo', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/editorial-proposals/generation?*', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: 'REAL',
        maxCostUsd: 0.25,
      },
    }),
  );
  await page.route('**/editorial-proposals/generate', (route) => {
    calls++;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await dialog.getByRole('checkbox', { name: /Autorizo gerar uma proposta/ }).check();
  await dialog.getByRole('button', { name: 'Gerar proposta editorial', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('registro financeiro');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Gerar proposta editorial', exact: true })).toBeDisabled();
  expect(calls).toBe(1);
});

async function acceptForApplication(page: Page) {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await upload(page, f.proposal);
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('ACCEPT');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Conferi este ajuste.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Decisão salva');
  return { ...f, dialog };
}

test('aplicação editorial exige seleção e confirmação e abre nova versão preservando original', async ({ page }) => {
  const f = await acceptForApplication(page);
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') writes.push(req.url());
  });
  const select = f.dialog.getByRole('checkbox', { name: 'Aplicar ajuste editorial 1', exact: true });
  await expect(select).not.toBeChecked();
  const apply = f.dialog.getByRole('button', { name: 'Criar nova versão com selecionadas', exact: true });
  await expect(apply).toBeDisabled();
  await select.check();
  await f.dialog.getByLabel('Fundamento da aplicação', { exact: true }).fill('Aplicação conferida por mim.');
  await expect(apply).toBeDisabled();
  await f.dialog.getByRole('checkbox', { name: 'Confirmo criar uma nova versão com os ajustes selecionados.' }).check();
  expect(writes).toEqual([]);
  await apply.click();
  await expect(f.dialog).toContainText('Nova versão criada');
  await expect(f.dialog.getByRole('link', { name: 'Abrir versão criada' })).toBeVisible();
  const saved = await (
    await page.request.get(`${f.path}/editorial-review?${new URLSearchParams(f.target)}`, { headers })
  ).json();
  expect(saved.application.versionId).not.toBe(f.target.versionId);
  await page.reload();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(f.dialog).toContainText('Aplicação conferida por mim.');
  await expect(f.dialog.getByRole('button', { name: 'Criar nova versão com selecionadas' })).toHaveCount(0);
  await page.screenshot({ path: 'tmp/editorial-application-desktop.png' });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await f.dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'tmp/editorial-application-mobile.png' });
  await f.dialog.getByRole('link', { name: 'Abrir versão criada' }).click();
  await expect(page).toHaveURL(new RegExp(saved.application.versionId));
  await expect(page.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    '[DESTINATÁRIO A CONFERIR ANTES DO USO]',
  );
  expect(writes.filter((url) => /editorial-review\/applications$/.test(url))).toHaveLength(1);
  expect(writes.some((url) => /editorial-proposals\/generate|\/executions$/.test(url))).toBe(false);
});

test('aplicação editorial recupera resposta perdida sem duplicar versão', async ({ page }) => {
  const f = await acceptForApplication(page);
  await f.dialog.getByRole('checkbox', { name: 'Aplicar ajuste editorial 1', exact: true }).check();
  await f.dialog.getByLabel('Fundamento da aplicação', { exact: true }).fill('Aplicação explícita.');
  await f.dialog.getByRole('checkbox', { name: 'Confirmo criar uma nova versão com os ajustes selecionados.' }).check();
  const bodies: string[] = [];
  await page.route('**/editorial-review/applications', async (route) => {
    bodies.push(route.request().postData()!);
    if (bodies.length === 1) {
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await f.dialog.getByRole('button', { name: 'Criar nova versão com selecionadas' }).click();
  await expect(f.dialog.getByRole('button', { name: 'Verificar aplicação' })).toBeVisible();
  await expect(f.dialog.getByLabel('Arquivo da proposta editorial')).toBeDisabled();
  await f.dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await f.dialog.getByRole('button', { name: 'Verificar aplicação' }).click();
  await expect(f.dialog).toContainText('Nova versão criada');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
});

test('revisão editorial persiste decisão, preserva minuta, permite recarga e funciona em tela móvel', async ({
  page,
}) => {
  const f = await setup(page);
  const requests: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET') requests.push(req.url());
  });
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await expect(dialog).toContainText('Nenhuma decisão editorial salva');
  await upload(page, f.proposal);
  await expect(dialog).toContainText('Proposta sintética; conferir cabimento.');
  await expect(dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('ACCEPT');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Conferi o trecho; manter ressalva.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Decisão salva');
  await page.reload();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog).toContainText('Conferi o trecho; manter ressalva.');
  await expect(dialog.getByRole('combobox', { name: 'Decisão 1', exact: true })).toHaveValue('');
  await page.screenshot({ path: 'tmp/editorial-review-desktop.png' });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/editorial-review-mobile.png' });
  await dialog.press('Escape');
  await expect(dialog).not.toBeVisible();
  const current = await (
    await page.request.get(`${f.path}/editorial-context?${new URLSearchParams(f.target)}`, { headers })
  ).json();
  expect(current.document).toEqual(f.delivery.delivery.document);
  // Reload also bootstraps the existing session. Scope the invariant to agent/draft commands.
  expect(
    requests
      .filter((url) => /\/api\/agentic\/|\/drafts(?:\/|$)/.test(url))
      .every((url) => /editorial-review\/(preview|decisions)$/.test(url)),
  ).toBe(true);
});

test('revisão editorial conserva comando após resposta perdida e bloqueia proposta inválida', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await upload(page, { ...f.proposal, humanReviewRequired: false });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true })).toHaveCount(0);
  await upload(page, f.proposal);
  const sent: unknown[] = [];
  await page.route('**/editorial-review/decisions', async (route) => {
    sent.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (sent.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('REJECT');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Prefiro manter o trecho original.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
  await expect(dialog.getByRole('combobox', { name: 'Decisão 1', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Verificar decisão' }).click();
  await expect(dialog.getByRole('status')).toContainText('Decisão salva');
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(
    (await (await page.request.get(`${f.path}/editorial-review?${new URLSearchParams(f.target)}`, { headers })).json())
      .history,
  ).toHaveLength(1);
});

test('revisão editorial recusa JSON nulo e bloqueia decisão obsoleta até atualizar', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await upload(page, null);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await upload(page, f.proposal);
  let attempts = 0;
  await page.route('**/editorial-review/decisions', (route) => {
    attempts++;
    return route.fulfill({ status: 409, json: { error: 'EDITORIAL_REVIEW_CONFLICT' } });
  });
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('DEFER');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Preciso conferir outra fonte.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Atualize');
  await expect(dialog.getByRole('combobox', { name: 'Decisão 1', exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
  await dialog.getByRole('button', { name: 'Atualizar revisão' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog).toContainText('Nenhuma decisão editorial salva');
});

test('revisão editorial permite fechar consulta pendente e ignora resposta tardia', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await expect(dialog).toContainText('Nenhuma decisão editorial salva');
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    reached = r;
  });
  await page.route('**/editorial-review/preview', async (route) => {
    const response = await route.fetch();
    reached();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  await upload(page, f.proposal);
  await started;
  await dialog.press('Escape');
  await expect(dialog).not.toBeVisible();
  release();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog).toContainText('Nenhuma decisão editorial salva');
  await expect(dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true })).toHaveCount(0);
});

test('revisão editorial trata IDs herdados como dados e reconcilia conflito após resposta perdida', async ({
  page,
}) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const id of ['constructor', '__proto__', 'toString']) {
    await upload(page, { ...f.proposal, changes: [{ ...f.proposal.changes[0], id }] });
    await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('ACCEPT');
    await expect(dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
  await upload(page, f.proposal);
  let attempts = 0;
  await page.route('**/editorial-review/decisions', async (route) => {
    attempts++;
    if (attempts === 1) {
      await route.fetch();
      await route.abort('failed');
    } else await route.fulfill({ status: 409, json: { error: 'EDITORIAL_CONTEXT_CHANGED' } });
  });
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('ACCEPT');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Conferido antes da alteração.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await dialog.getByRole('button', { name: 'Verificar decisão' }).click();
  await expect(dialog.getByRole('status')).toContainText('Decisão localizada no histórico');
  await expect(dialog.getByRole('button', { name: 'Verificar decisão' })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test('revisão editorial recupera conflito sem registro após resposta perdida', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await upload(page, f.proposal);
  let attempts = 0;
  await page.route('**/editorial-review/decisions', async (route) => {
    attempts++;
    if (attempts === 1) await route.abort('failed');
    else await route.fulfill({ status: 409, json: { error: 'EDITORIAL_REVIEW_CONFLICT' } });
  });
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('DEFER');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Aguardar conferência.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
  await dialog.getByRole('button', { name: 'Verificar decisão' }).click();
  await expect(dialog.getByRole('status')).toContainText('Comando não consta do histórico');
  await expect(dialog.getByRole('button', { name: 'Verificar decisão' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Atualizar revisão' })).toBeEnabled();
  expect(attempts).toBe(2);
});

test('histórico editorial permanece na mesa depois de edição humana da minuta', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial' });
  await upload(page, f.proposal);
  await dialog.getByRole('combobox', { name: 'Decisão 1', exact: true }).selectOption('DEFER');
  await dialog.getByRole('textbox', { name: 'Fundamento 1', exact: true }).fill('Registro anterior à edição humana.');
  await dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Decisão salva');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Mesa da peça' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Texto da seção 1', exact: true })
    .fill('Texto alterado manualmente na fixture.');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Há alterações não salvas.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('desatualizada');
  await expect(dialog).toContainText('Registro anterior à edição humana.');
  await expect(dialog.getByLabel('Arquivo da proposta editorial')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true })).toHaveCount(0);
});
