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
  await page.getByRole('link', { name: 'Editar minuta', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })
    .fill('Texto alterado manualmente na fixture.');
  await page.getByText('Salvar e exportar', { exact: true }).click();
  await page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click();
  await expect(page.getByText('Há alterações não salvas.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar ao trabalho', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar proposta editorial', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('desatualizada');
  await expect(dialog).toContainText('Registro anterior à edição humana.');
  await expect(dialog.getByLabel('Arquivo da proposta editorial')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Salvar decisão 1', exact: true })).toHaveCount(0);
});
