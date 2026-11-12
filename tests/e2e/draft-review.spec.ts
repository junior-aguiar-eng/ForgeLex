import { expect, test, type Page } from '@playwright/test';

// A conferência do rascunho acontece dentro da Mesa (única Mesa desde a U1): a peça abre por /app/trabalho e a
// conferência fica no diálogo "Conferência da peça". O editor avulso (várias seções, histórico de conferências por
// versão, "Salvar e conferir") foi removido; ver o registro de execução da U1.
async function setup(page: Page, linked = true) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('conferencia@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const api = process.env.FORGELEX_TEST_API_ORIGIN ?? 'http://127.0.0.1:3301';
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
  await page.goto(`/app/trabalho?matterId=${matter.id}&draftId=${draft.draft.id}`);
  await expect(page.getByRole('textbox', { name: 'Texto da seção 1', exact: true })).toHaveValue(
    'O contrato foi assinado.',
  );
  return { root, headers, draft, fact, document, matter };
}
async function openReview(page: Page) {
  await page.getByRole('button', { name: 'Conferência da peça', exact: true }).click();
  return page.getByRole('dialog', { name: 'Conferência da peça' });
}
test('aprova pela Mesa e exporta sem token exposto ou API auxiliar', async ({ page }) => {
  await setup(page, false);
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await review.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
  const approval = page.getByRole('dialog', { name: 'Aprovar esta versão' });
  await expect(approval).toContainText('Versão 1');
  await approval.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByText('Aprovação registrada para esta versão.').first()).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByLabel('Exportar peça').click();
  await page.getByRole('button', { name: 'Word (.docx)', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
});
const pointOf = (review: ReturnType<Page['getByRole']>, text: string) =>
  review
    .locator('div.rounded-xl')
    .filter({ has: review.page().getByText(text, { exact: true }) })
    .getByRole('button', { name: 'Ver ponto', exact: true });
test('ESC fecha o painel de fonte mesmo durante leitura demorada', async ({ page }) => {
  await setup(page);
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
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
  const point = pointOf(review, 'Este fato não tem prova de apoio vinculada.');
  try {
    const requested = page.waitForRequest((request) => /\/facts\/[^/]+\/support$/.test(request.url()), {
      timeout: 10_000,
    });
    if (!(await point.isVisible())) await review.getByText(/Verificações concluídas ·/).click();
    await point.click();
    await requested;
    await ready;
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(point).toBeFocused();
  } finally {
    release();
  }
});
test('referência do acervo local é revalidada sem marcar conferência humana', async ({ page }) => {
  const f = await setup(page, false);
  const search = await page.request.post(
    (process.env.FORGELEX_TEST_API_ORIGIN ?? 'http://127.0.0.1:3301') + '/api/v2/research/search-case-law',
    {
      headers: { ...f.headers, 'Idempotency-Key': 'review-e2e-' + Date.now() },
      data: { query: 'vazamento', court: 'STJ', limit: 1 },
    },
  );
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
  await page.goto(`/app/trabalho?matterId=${f.matter.id}&draftId=${f.draft.draft.id}`);
  await expect(page.getByRole('textbox', { name: 'Texto da seção 1', exact: true })).toHaveValue(
    'Texto a ser conferido.',
  );
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await expect(review).toContainText('Localizada no acervo');
  await expect(review).toContainText('Conferência humana ainda não registrada');
  const details = await (await page.request.get(f.root + '/drafts/' + f.draft.draft.id, { headers: f.headers })).json();
  expect(details.currentVersion.citations[0].verified).toBe(false);
  expect(details.latestReviewRun.draftVersionId).toBe((await version.json()).version.id);
  expect(details.latestReviewRun.checks.find((c: { targetType: string }) => c.targetType === 'AUTHORITY').state).toBe(
    'CONFIRMED',
  );
  await page.goto(`/app/trabalho?matterId=${f.matter.id}&draftId=${f.draft.draft.id}`);
  await expect(page.getByRole('textbox', { name: 'Texto da seção 1', exact: true })).toHaveValue(
    'Texto a ser conferido.',
  );
  await expect(await openReview(page)).toContainText('Localizada no acervo');
});
test('abrir rascunho atualiza fatos criados após o carregamento do caso', async ({ page }) => {
  await page.route('**/matters/*/facts', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { items: [] } }) : route.continue(),
  );
  const f = await setup(page);
  await page.unroute('**/matters/*/facts');
  await page.getByText('Peça aberta', { exact: true }).click();
  await page.getByLabel('Peça do caso').selectOption('');
  await page.getByLabel('Peça do caso').selectOption(f.draft.draft.id);
  await expect(page.getByRole('textbox', { name: 'Texto da seção 1', exact: true })).toHaveValue(
    'O contrato foi assinado.',
  );
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  const point = pointOf(review, 'Este fato não tem prova de apoio vinculada.');
  if (!(await point.isVisible())) await review.getByText(/Verificações concluídas ·/).click();
  await point.click();
  await expect(page.getByRole('dialog', { name: 'Precisa de atenção' })).toContainText(f.fact.statement);
  await expect(page.getByLabel('Documento do caso')).toContainText('Contrato do caso');
});
test('vínculo salvo permanece reconhecido quando a releitura da fonte falha', async ({ page }) => {
  const f = await setup(page);
  await page.request.post(f.root + '/facts/' + f.fact.id + '/support', {
    headers: f.headers,
    data: { anchorId: f.document.anchors[0].id, relation: 'SUPPORTS' },
  });
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  const approval = review.getByRole('button', { name: 'Aprovar esta versão', exact: true });
  await expect(approval).toBeEnabled();
  const point = pointOf(review, 'Há provas vinculadas ao fato. O vínculo não comprova a veracidade do conteúdo.');
  if (!(await point.isVisible())) await review.getByText(/Verificações concluídas ·/).click();
  await point.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Fontes vinculadas' });
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
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(approval).not.toBeVisible();
  const support = await (
    await page.request.get(f.root + '/facts/' + f.fact.id + '/support', { headers: f.headers })
  ).json();
  expect(support.sourceLinks).toHaveLength(2);
});
