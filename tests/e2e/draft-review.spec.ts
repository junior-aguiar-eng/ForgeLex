import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function setup(page: Page, linked = true) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('conferencia@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const api = 'http://127.0.0.1:3301';
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Caso de conferência ' + Date.now() } })
  ).json();
  const root = api + '/api/v2/matters/' + matter.id;
  const fact = await (
    await page.request.post(root + '/facts', { headers, data: { statement: 'O contrato foi assinado.' } })
  ).json();
  const document = await (
    await page.request.post(root + '/documents', {
      headers,
      data: {
        title: 'Contrato do caso',
        originalFilename: 'contrato.txt',
        mimeType: 'text/plain',
        content: 'As partes assinaram o contrato em 2 de outubro. '.repeat(20),
      },
    })
  ).json();
  const draft = await (
    await page.request.post(root + '/drafts', {
      headers,
      data: {
        title: 'Minuta para conferência',
        sections: [
          { ordinal: 0, title: 'Fatos', content: 'O contrato foi assinado.', linkedFactIds: linked ? [fact.id] : [] },
          { ordinal: 1, title: 'Pedidos', content: 'Requer a análise do contrato.' },
        ],
      },
    })
  ).json();
  await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
  await page.getByRole('button', { name: matter.title }).click();
  await page.getByRole('button', { name: /Minuta para conferência/ }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })).toHaveValue(
    'O contrato foi assinado.',
  );
  return { root, headers, draft, fact, document, matter };
}
test('corrigir fonte no rascunho preserva edição, exige nova conferência e mantém histórico', async ({
  page,
}, testInfo) => {
  const f = await setup(page);
  const review = page.getByRole('button', { name: 'Conferir rascunho', exact: true });
  const approval = page.getByRole('button', { name: 'Encaminhar à aprovação', exact: true });
  await expect(approval).toBeDisabled();
  await review.click();
  const panel = page.getByRole('region', { name: 'Conferência do rascunho' });
  await expect(panel).toContainText('Há pontos que precisam de correção');
  const textbox = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await textbox.fill('Texto que ainda está em edição.');
  const point = panel
    .locator('div')
    .filter({ has: page.getByText('Este fato não tem prova de apoio vinculada.', { exact: true }) })
    .getByRole('button', { name: 'Ver ponto', exact: true });
  await point.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('O contrato foi assinado.');
  await page.getByLabel('Documento do caso').selectOption(f.document.document.id);
  await page.getByLabel('Trecho do documento').selectOption(f.document.anchors[0].id);
  await expect(dialog).toContainText('As partes assinaram o contrato');
  await page.getByRole('button', { name: 'Vincular fonte ao fato' }).click();
  await expect(dialog.getByRole('status')).toContainText('Vínculo registrado');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: testInfo.outputPath('source-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(point).toBeFocused();
  await expect(textbox).toHaveValue('Texto que ainda está em edição.');
  await expect(review).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click();
  await expect(review).toBeEnabled();
  await expect(panel).toContainText('Conferência pendente');
  await review.click();
  await expect(panel).toContainText('Há provas vinculadas ao fato');
  await expect(approval).toBeEnabled();
  await page.getByText('Histórico de versões e conferências', { exact: true }).click();
  await page.getByRole('button', { name: 'Ver conferências da versão 1', exact: true }).click();
  await expect(page.getByText('Consultar o histórico preserva o texto em edição.')).toBeVisible();
  await expect(textbox).toHaveValue('Texto que ainda está em edição.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.screenshot({ path: testInfo.outputPath('review-desktop.png') });
});
test('resposta demorada da conferência não apaga texto digitado durante a consulta', async ({ page }) => {
  await setup(page, false);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/drafts/*/review', async (route) => {
    const response = await route.fetch();
    started();
    await hold;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await ready;
  const editor = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await editor.fill('Texto digitado durante a conferência.');
  release();
  await expect(page.getByRole('region', { name: 'Conferência do rascunho' })).toContainText('Há alterações');
  await expect(editor).toHaveValue('Texto digitado durante a conferência.');
  await expect(page.getByRole('button', { name: 'Encaminhar à aprovação', exact: true })).toBeDisabled();
});
test('falha ao salvar não confere nem descarta a edição; trocar caso permite cancelar', async ({ page }) => {
  await setup(page, false);
  const editor = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await editor.fill('Edição preservada após falha.');
  let reviews = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/review') && request.method() === 'POST') reviews++;
  });
  await page.route('**/drafts/*/versions', (route) =>
    route.fulfill({ status: 500, json: { error: 'SAVE_FAILED', message: 'Falha de salvamento no ensaio.' } }),
  );
  await page.getByRole('button', { name: 'Salvar e conferir', exact: true }).click();
  await expect(page.getByText('Falha de salvamento no ensaio.', { exact: true })).toBeVisible();
  await expect(editor).toHaveValue('Edição preservada após falha.');
  expect(reviews).toBe(0);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: /Caso E2E Fase 7/ }).click();
  await expect(editor).toHaveValue('Edição preservada após falha.');
});
test('ESC fecha painel mesmo durante leitura demorada da fonte', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/facts/*/support', async (route) => {
    started();
    await hold;
    await route.continue();
  });
  const point = page
    .getByRole('region', { name: 'Conferência do rascunho' })
    .locator('div')
    .filter({ has: page.getByText('Este fato não tem prova de apoio vinculada.', { exact: true }) })
    .getByRole('button', { name: 'Ver ponto', exact: true });
  try {
    const requested = page.waitForRequest((request) => /\/facts\/[^/]+\/support$/.test(request.url()), {
      timeout: 10_000,
    });
    await point.click();
    await requested;
    await ready;
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(point).toBeFocused();
  } finally {
    release();
  }
});
test('resposta antiga do histórico não substitui a versão escolhida', async ({ page }) => {
  const f = await setup(page, false);
  await page.request.post(f.root + '/drafts/' + f.draft.draft.id + '/review', { headers: f.headers, data: {} });
  await page.request.post(f.root + '/drafts/' + f.draft.draft.id + '/review', { headers: f.headers, data: {} });
  await page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true }).fill('Versão seguinte.');
  await page.getByRole('button', { name: 'Salvar e conferir', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conferência do rascunho' })).toContainText('Conferência concluída');
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/review-runs?*', async (route) => {
    const response = await route.fetch();
    if (route.request().url().includes(f.draft.version.id)) {
      started();
      await hold;
    }
    await route.fulfill({ response });
  });
  await page.getByText('Histórico de versões e conferências', { exact: true }).click();
  await page.getByRole('button', { name: 'Ver conferências da versão 1', exact: true }).click();
  await ready;
  const history = page
    .locator('details')
    .filter({ has: page.getByText('Histórico de versões e conferências', { exact: true }) })
    .first();
  await page.getByRole('button', { name: 'Ver conferências da versão 2', exact: true }).click();
  await expect(history.locator('summary').filter({ hasText: 'Conferência 1' })).toHaveCount(1);
  release();
  await page.waitForResponse(
    (response) => response.url().includes(f.draft.version.id) && response.url().includes('review-runs'),
  );
  await expect(history.locator('summary').filter({ hasText: 'Conferência 2' })).toHaveCount(0);
});
test('referência do acervo local é revalidada sem marcar conferência humana', async ({ page }) => {
  const f = await setup(page, false);
  const search = await page.request.post('http://127.0.0.1:3301/api/v2/research/search-case-law', {
    headers: { ...f.headers, 'Idempotency-Key': 'review-e2e-' + Date.now() },
    data: { query: 'vazamento', court: 'STJ', limit: 1 },
  });
  expect(search.status()).toBe(200);
  const authority = (await search.json()).results[0];
  const saved = (
    await (await page.request.post(f.root + '/authorities', { headers: f.headers, data: { authority } })).json()
  ).record;
  const version = await page.request.post(f.root + '/drafts/' + f.draft.draft.id + '/versions', {
    headers: f.headers,
    data: {
      title: 'Minuta para conferência',
      sections: [
        { ordinal: 0, title: 'Fundamentos', content: 'Texto a ser conferido.', linkedAuthorityIds: [saved.id] },
        { ordinal: 1, title: 'Pedidos', content: 'Requer análise.' },
      ],
      citations: [
        {
          sectionOrdinal: 0,
          targetType: 'AUTHORITY',
          targetId: saved.id,
          citationText: 'Julgado do acervo de teste',
          verified: false,
        },
      ],
    },
  });
  expect(version.status()).toBe(200);
  await page.getByRole('button', { name: /Minuta para conferência/ }).click();
  await page.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conferência do rascunho' })).toContainText('Localizada no acervo');
  await expect(page.getByRole('region', { name: 'Conferência do rascunho' })).toContainText(
    'Conferência humana ainda não registrada',
  );
  const details = await (await page.request.get(f.root + '/drafts/' + f.draft.draft.id, { headers: f.headers })).json();
  expect(details.currentVersion.citations[0].verified).toBe(false);
  expect(details.latestReviewRun.draftVersionId).toBe((await version.json()).version.id);
  expect(details.latestReviewRun.checks.find((c: { targetType: string }) => c.targetType === 'AUTHORITY').state).toBe(
    'CONFIRMED',
  );
  await page.reload();
  await page.getByRole('button', { name: f.matter.title }).click();
  await page.getByRole('button', { name: /Minuta para conferência/ }).click();
  await expect(page.getByRole('region', { name: 'Conferência do rascunho' })).toContainText('Localizada no acervo');
});
test('composição inicial ainda não salva também protege o texto ao trocar de caso', async ({ page }) => {
  await setup(page, false);
  await page.getByRole('button', { name: /Caso E2E Fase 7/ }).click();
  const editor = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await editor.fill('Primeira composição ainda não salva.');
  await expect(page.getByRole('button', { name: 'Criar rascunho', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('button', { name: /Caso de conferência/ })
    .last()
    .click();
  await expect(editor).toHaveValue('Primeira composição ainda não salva.');
});
test('vínculo salvo permanece reconhecido quando a releitura da fonte falha', async ({ page }) => {
  const f = await setup(page);
  await page.request.post(f.root + '/facts/' + f.fact.id + '/support', {
    headers: f.headers,
    data: { anchorId: f.document.anchors[0].id, relation: 'SUPPORTS' },
  });
  await page.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  const approval = page.getByRole('button', { name: 'Encaminhar à aprovação', exact: true });
  await expect(approval).toBeEnabled();
  const point = page
    .getByRole('region', { name: 'Conferência do rascunho' })
    .locator('div')
    .filter({
      has: page.getByText('Há provas vinculadas ao fato. O vínculo não comprova a veracidade do conteúdo.', {
        exact: true,
      }),
    })
    .getByRole('button', { name: 'Ver ponto', exact: true });
  await point.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Contrato do caso');
  await page.getByLabel('Documento do caso').selectOption(f.document.document.id);
  await page.getByLabel('Trecho do documento').selectOption(f.document.anchors[0].id);
  await page.getByLabel('Relação com o fato').selectOption('CONTEXT');
  await page.route('**/facts/*/support', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { error: 'SOURCE_READ_FAILED', message: 'Falha na releitura.' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Vincular fonte ao fato' }).click();
  await expect(dialog.getByRole('status')).toContainText('Vínculo registrado');
  await expect(dialog.getByRole('alert')).toContainText('carregar as fontes');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(approval).toBeDisabled();
  const support = await (
    await page.request.get(f.root + '/facts/' + f.fact.id + '/support', { headers: f.headers })
  ).json();
  expect(support.sourceLinks).toHaveLength(2);
});
