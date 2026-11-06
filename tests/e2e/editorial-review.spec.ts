import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const text = 'O relato esta claro. Três parcelas de R$ 100,00 cada. O total indicado no relato é R$ 200,00.';
async function setup(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Ensaio local da mesa' } })
  ).json();
  const created = await page.request.post(`${api}/api/v2/matters/${matter.id}/drafts`, {
    headers,
    data: {
      title: 'Peça sintética',
      sections: [
        {
          ordinal: 0,
          title: 'Texto da peça',
          content: text,
          linkedFactIds: [],
          linkedEvidenceIds: [],
          linkedAuthorityIds: [],
          linkedThesisIds: [],
        },
      ],
      citations: [],
    },
  });
  expect(created.ok()).toBe(true);
  const saved = await created.json();
  const target = { draftId: saved.draft.id, versionId: saved.version.id };
  const path = `${api}/api/agentic/deliveries/${encodeURIComponent('desk:' + matter.id)}`;
  const context = await (
    await page.request.get(`${path}/editorial-context?${new URLSearchParams(target)}`, { headers })
  ).json();
  const {
    document,
    origin: _origin,
    sources: _s,
    claims: _c,
    requirements: _r,
    findings: _f,
    supportAudit: _a,
    ...envelope
  } = context;
  const content = document.sections[0].content;
  const proposal = {
    ...envelope,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [
      {
        id: 'edit',
        category: 'GRAMMAR',
        sectionIndex: 0,
        sectionHash: createHash('sha256').update(content).digest('hex'),
        start: 9,
        end: 13,
        before: 'esta',
        after: 'está',
        reason: 'Corrigir a acentuação.',
        sourceIds: [],
      },
    ],
    substantiveSuggestions: [],
    limitations: ['Ensaio local, sem validação jurídica.'],
  };
  let starts = 0;
  const keys: string[] = [];
  let completed = false;
  await page.route(`${path}/editorial-proposals/generation?*`, (route) =>
    route.fulfill({
      json: { enabled: true, mode: 'COMMERCIAL', policyVersion: 'commercial-brl-2026-10-30-v1', maxCostCents: 500 },
    }),
  );
  const result = () => ({
    commandId: 'synthetic-' + starts,
    status: 'COMPLETED',
    receipt: { reservedCents: 500, chargedCents: 50, releasedCents: 450, status: 'COMPLETED' },
    result: { proposal },
  });
  await page.route(`${path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'POST') {
      starts++;
      keys.push(route.request().headers()['idempotency-key']);
      expect(route.request().postDataJSON()).toMatchObject({
        ...target,
        confirmed: true,
        policyVersion: 'commercial-brl-2026-10-30-v1',
      });
      completed = true;
      await route.fulfill({ json: result() });
    } else await route.fulfill({ json: { command: completed ? result() : null } });
  });
  await page.goto(`/app/trabalho?matterId=${matter.id}&draftId=${target.draftId}&versionId=${target.versionId}`);
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text);
  await desk.getByRole('button', { name: 'Revisar peça', exact: true }).click();
  const notes = desk.getByRole('region', { name: 'Revisão na mesa' });
  await expect(notes.getByRole('button', { name: /Revisar com IA/ })).toBeEnabled();
  return {
    desk,
    notes,
    path,
    target,
    proposal,
    keys,
    starts: () => starts,
    matter,
    result,
    complete: () => {
      completed = true;
      starts++;
    },
  };
}
async function generate(f: Awaited<ReturnType<typeof setup>>) {
  await f.notes.getByRole('button', { name: /Revisar com IA/ }).click();
  await expect(f.notes.getByText(/Revisão concluída/)).toBeVisible();
  await f.notes.getByRole('button', { name: 'Próximo apontamento' }).click();
  await expect(f.notes.getByRole('button', { name: 'Aplicar esta sugestão' })).toBeEnabled();
}

test('revisão, conversa e texto na mesma mesa, sem modal ou formulário técnico', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await setup(page);
  await expect(f.notes.getByText(/3 × R\$ 100,00 = R\$ 300,00/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Arquivo da proposta editorial')).toHaveCount(0);
  await expect(page.getByLabel('Fundamento 1')).toHaveCount(0);
  expect(f.starts()).toBe(0);
  await f.notes.getByRole('button', { name: 'Pedir ajuste na conversa' }).click();
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(/3 × R\$ 100,00/);
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text);
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/writing-desk/review-inline-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Peça', exact: true }).click();
  await expect(f.notes).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/writing-desk/review-inline-mobile.png', fullPage: true });
});

test('revisão paga simulada exige clique com preço, não aplica e recupera recibo sem cobrar novamente', async ({
  page,
}) => {
  const f = await setup(page);
  await expect(f.notes.getByRole('button', { name: /Revisar com IA/ })).toContainText(/5,00/);
  await generate(f);
  expect(f.starts()).toBe(1);
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text);
  await f.notes.getByText('Recibo', { exact: true }).click();
  await expect(f.notes.getByText(/Cobrado: R\$\s*0,50/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Revisar peça', exact: true }).click();
  await expect(f.notes.getByText(/Revisão concluída/)).toBeVisible();
  expect(f.starts()).toBe(1);
  await f.notes.getByRole('button', { name: /Revisar novamente/ }).click();
  await expect.poll(f.starts).toBe(2);
  expect(new Set(f.keys).size).toBe(2);
});

test('clique explícito aplica apenas a sugestão escolhida e preserva a versão original', async ({ page }) => {
  const f = await setup(page);
  await generate(f);
  await f.notes.getByRole('button', { name: 'Aplicar esta sugestão' }).click();
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text.replace('esta', 'está'));
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${f.matter.id}/drafts/${f.target.draftId}`, { headers })
  ).json();
  expect(details.versions).toHaveLength(2);
  expect(details.versions.some((v: { id: string }) => v.id === f.target.versionId)).toBe(true);
  expect(f.starts()).toBe(1);
});

test('edição não salva bloqueia cobrança e aplicação', async ({ page }) => {
  const f = await setup(page);
  await generate(f);
  await f.desk.getByLabel('Texto da seção 1', { exact: true }).fill('Minha edição local.');
  await expect(f.notes.getByRole('button', { name: 'Aplicar esta sugestão' })).toBeDisabled();
  await expect(f.notes.getByRole('button', { name: /Revisar novamente/ })).toBeDisabled();
  expect(f.starts()).toBe(1);
});

test('resposta perdida de cobrança recupera o mesmo comando sem novo envio', async ({ page }) => {
  const f = await setup(page);
  let starts = 0;
  await page.route(`${f.path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'POST') {
      starts++;
      f.complete();
      await route.abort();
    } else await route.fulfill({ json: { command: f.result() } });
  });
  await f.notes.getByRole('button', { name: /Revisar com IA/ }).click();
  await expect(f.notes.getByRole('alert')).toBeVisible();
  await f.notes.getByRole('button', { name: 'Conferir andamento' }).click();
  await expect(f.notes.getByText(/Revisão concluída/)).toBeVisible();
  expect(starts).toBe(1);
});

test('resposta perdida de aplicação recupera versão sem duplicação', async ({ page }) => {
  const f = await setup(page);
  await generate(f);
  let applications = 0;
  await page.route(`${f.path}/editorial-review/applications`, async (route) => {
    applications++;
    const response = await route.fetch();
    if (applications === 1) await route.abort();
    else await route.fulfill({ response });
  });
  await f.notes.getByRole('button', { name: 'Aplicar esta sugestão' }).click();
  await expect(f.notes.getByRole('alert')).toBeVisible();
  await f.notes.getByRole('button', { name: 'Conferir resultado' }).click();
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text.replace('esta', 'está'));
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${f.matter.id}/drafts/${f.target.draftId}`, { headers })
  ).json();
  expect(details.versions).toHaveLength(2);
});

test('andamento é acompanhado automaticamente sem repetir a cobrança', async ({ page }) => {
  const f = await setup(page);
  let starts = 0,
    polls = 0;
  await page.route(`${f.path}/editorial-proposals/commands*`, async (route) => {
    if (route.request().method() === 'POST') {
      starts++;
      f.complete();
      await route.fulfill({ json: { commandId: 'pending-local', status: 'RUNNING' } });
    } else {
      polls++;
      await route.fulfill({
        json: { command: polls < 2 ? { commandId: 'pending-local', status: 'RUNNING' } : f.result() },
      });
    }
  });
  await f.notes.getByRole('button', { name: /Revisar com IA/ }).click();
  await expect(f.notes.getByText(/Revisão concluída/)).toBeVisible();
  expect(starts).toBe(1);
  expect(polls).toBeGreaterThanOrEqual(2);
});

test('proposta com âncora inválida não oferece aplicação', async ({ page }) => {
  const f = await setup(page);
  f.proposal.changes[0].before = 'Trecho que não existe';
  await f.notes.getByRole('button', { name: /Revisar com IA/ }).click();
  await expect(f.notes.getByRole('alert')).toContainText('Não foi possível validar');
  await expect(f.notes.getByRole('button', { name: 'Aplicar esta sugestão' })).toHaveCount(0);
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text);
});

test('resposta perdida na decisão não aplica texto nem repete cobrança', async ({ page }) => {
  const f = await setup(page);
  await generate(f);
  let decisions = 0,
    applications = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/editorial-review/applications')) applications++;
  });
  await page.route(`${f.path}/editorial-review/decisions`, async (route) => {
    decisions++;
    const response = await route.fetch();
    if (decisions === 1) await route.abort();
    else await route.fulfill({ response });
  });
  await f.notes.getByRole('button', { name: 'Aplicar esta sugestão' }).click();
  await expect(f.notes.getByRole('alert')).toBeVisible();
  expect(applications).toBe(0);
  await f.notes.getByRole('button', { name: 'Conferir resultado' }).click();
  await expect(f.notes.getByRole('alert')).toHaveCount(0);
  await expect(f.desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(text);
  expect(applications).toBe(0);
  expect(f.starts()).toBe(1);
});
