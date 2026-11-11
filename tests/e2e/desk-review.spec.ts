import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';

const api = 'http://127.0.0.1:3551';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const content = 'O pedido esta condicionado.';

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('revisao-mesa@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

async function seedDraft(page: Page) {
  const matter = await (
    await page.request.post(`${api}/api/v2/matters`, {
      headers,
      data: { title: 'Caso de revisão na Mesa' },
    })
  ).json();
  const root = `${api}/api/v2/matters/${matter.id}`;
  const response = await page.request.post(`${root}/drafts`, {
    headers,
    data: { title: 'Peça de revisão', sections: [{ ordinal: 0, title: 'Pedido', content }] },
  });
  expect(response.ok()).toBe(true);
  const { draft, version } = await response.json();
  const target = { matterId: matter.id, draftId: draft.id, versionId: version.id };
  return { root, target, url: `${root}/drafts/${draft.id}`, query: new URLSearchParams(target) };
}

test('decisão editorial, aplicação e aprovação formal acontecem em etapas da Mesa', async ({ page }) => {
  const draft = await seedDraft(page);
  await login(page);
  await page.goto(`/app/rascunhos?${draft.query}`);
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  const editor = desk.getByRole('textbox', { name: 'Texto da seção 1' });
  await expect(editor).toHaveValue(content);
  const editorialRead = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().includes('/editorial-review?'),
  );
  await desk.getByRole('button', { name: 'Revisão editorial', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisão editorial', exact: true });
  const response = await editorialRead;
  expect(response.ok()).toBe(true);
  const { context } = await response.json();
  expect(context.versionId).toBe(draft.target.versionId);
  const proposal = {
    contractVersion: context.contractVersion,
    contextId: context.contextId,
    contextRevision: context.contextRevision,
    deliveryId: context.deliveryId,
    draftId: context.draftId,
    versionId: context.versionId,
    documentHash: context.documentHash,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [
      {
        id: 'acento',
        category: 'GRAMMAR',
        sectionIndex: 0,
        sectionHash: createHash('sha256').update(content).digest('hex'),
        start: 9,
        end: 13,
        before: 'esta',
        after: 'está',
        reason: 'Acentuação verbal.',
        sourceIds: [],
      },
    ],
    substantiveSuggestions: [],
    limitations: ['Conferência apenas editorial.'],
  };
  await dialog.getByLabel('Arquivo da proposta editorial').setInputFiles({
    name: 'proposta.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proposal)),
  });
  await dialog.getByLabel('Decisão 1').selectOption('ACCEPT');
  await dialog.getByLabel('Fundamento 1').fill('Conferi a acentuação.');
  const decision = page.waitForResponse((r) => r.url().endsWith('/editorial-review/decisions'));
  await dialog.getByRole('button', { name: 'Salvar decisão 1' }).click();
  expect((await (await decision).json()).history[0]).toMatchObject({
    proposal: { versionId: draft.target.versionId },
    decidedBy: expect.any(String),
    decision: { action: 'ACCEPT' },
  });
  expect((await (await page.request.get(draft.url, { headers })).json()).versions).toHaveLength(1);
  await dialog.getByLabel('Aplicar ajuste editorial 1', { exact: true }).check();
  await dialog.getByLabel('Fundamento da aplicação').fill('Aplicar apenas a acentuação conferida.');
  await dialog.getByLabel('Confirmo criar uma nova versão com os ajustes selecionados.').check();
  await dialog.getByRole('button', { name: 'Criar nova versão com selecionadas' }).click();
  await expect(editor).toHaveValue('O pedido está condicionado.');
  const derived = await (await page.request.get(draft.url, { headers })).json();
  expect(derived.versions).toHaveLength(2);
  expect(derived.draft.status).toBe('DRAFT');

  await desk.getByRole('button', { name: 'Conferência da peça' }).click();
  const review = page.getByRole('dialog', { name: 'Conferência da peça' });
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await review.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
  const approval = page.getByRole('dialog', { name: 'Aprovar esta versão' });
  await expect(approval).toContainText('Versão 2');
  await approval.getByRole('button', { name: 'Confirmar aprovação' }).click();
  await expect(review.getByText('Aprovação registrada para esta versão.')).toBeVisible();
  const approved = await (await page.request.get(draft.url, { headers })).json();
  expect(approved.approvals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: 'APPROVED', draftVersionId: derived.currentVersion.version.id }),
    ]),
  );
});

test('link antigo abre histórico da versão solicitada e não envia aprovação nem geração', async ({ page }) => {
  const draft = await seedDraft(page);
  const reviewed = await page.request.post(`${draft.url}/review`, {
    headers,
    data: { type: 'all', versionId: draft.target.versionId },
  });
  expect(reviewed.ok()).toBe(true);
  const newer = await page.request.post(`${draft.url}/versions`, {
    headers,
    data: {
      title: 'Peça de revisão',
      baseVersionId: draft.target.versionId,
      sections: [{ ordinal: 0, title: 'Pedido', content: 'Texto da versão atual.' }],
    },
  });
  expect(newer.ok()).toBe(true);
  await login(page);
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /review|approval|generate|executions/.test(r.url())) writes.push(r.url());
  });
  await page.goto(`/app/revisao?${draft.query}`);
  const review = page.getByRole('dialog', { name: 'Conferência da peça' });
  await expect(review.getByText('Histórico da versão 1. Somente leitura.')).toBeVisible();
  await expect(review.getByRole('region', { name: 'Conferência do rascunho' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Aprovar esta versão' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Texto da seção 1' })).toHaveValue('Texto da versão atual.');
  expect(writes).toEqual([]);
  const actual = await (await page.request.get(draft.url, { headers })).json();
  expect(actual.draft.status).toBe('DRAFT');
  expect(actual.approvals).toHaveLength(0);
});

test('entrada antiga de Revisão abre a fila de memorandos dentro da Mesa', async ({ page }) => {
  const draft = await seedDraft(page);
  const issue = await (
    await page.request.post(`${draft.root}/issues`, {
      headers,
      data: { statement: 'Qual a consequência civil do vazamento de dados?' },
    })
  ).json();
  const memo = await page.request.post(`${draft.root}/research-memos`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { query: 'vazamento', court: 'STJ', issueIds: [issue.id], limit: 3 },
  });
  expect(memo.ok()).toBe(true);
  const created = await memo.json();
  await login(page);
  await page.goto('/app/revisao');
  const queue = page.getByRole('dialog', { name: 'Revisão do caso' });
  await expect(queue.getByText(created.memo.title, { exact: true })).toBeVisible();
  await queue.getByRole('button', { name: 'Revisar item', exact: true }).first().click();
  const item = page.getByRole('dialog', { name: created.memo.title, exact: true });
  const decision = page.waitForResponse((r) => r.url().endsWith(`/research-memos/${created.record.id}/review`));
  await item.getByRole('button', { name: 'Aprovar', exact: true }).click();
  expect((await decision).ok()).toBe(true);
  await expect(queue.getByText(created.memo.title, { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/trabalho/);
});
