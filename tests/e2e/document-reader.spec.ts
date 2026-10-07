import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const api = 'http://127.0.0.1:3301';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const content =
  '  Contrato original: obrigação contratual.\n\nCláusula de pagamento: R$ 250,00.\n\n<script>window.documentExecuted=true</script>\n\nÚltimo parágrafo: obrigação cumprida.  ';

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('leitura@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

async function fixture(request: APIRequestContext) {
  const creation = await request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Caso de leitura ' + Date.now() },
  });
  expect(creation.status()).toBe(200);
  const matter = await creation.json();
  const root = api + '/api/v2/matters/' + matter.id;
  const save = await request.post(root + '/documents', {
    headers,
    data: { title: 'Contrato para leitura', originalFilename: 'contrato.txt', mimeType: 'text/plain', content },
  });
  expect(save.status()).toBe(200);
  const document = await save.json();
  return { matter, root, document };
}

test('ler documento integral, buscar, navegar por parágrafos e fechar preserva texto em edição', async ({
  page,
  request,
}, info) => {
  const f = await fixture(request);
  await login(page);
  await page.goto(`/app/casos?caso=${f.matter.id}`);
  const editor = page.getByLabel('Texto do documento');
  await editor.fill('Minha importação ainda não salva.');
  const open = page.getByRole('button', { name: 'Abrir documento: Contrato para leitura', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Leitura do documento' });
  await expect(dialog).toContainText('Contrato para leitura');
  await expect(dialog).toContainText('Versão 1');
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveText(content);
  expect(await page.evaluate(() => Boolean((window as any).documentExecuted))).toBe(false);
  await dialog.getByLabel('Buscar no documento').fill('obrigação');
  await expect(dialog.getByRole('status')).toContainText('1 de 2');
  await expect(dialog.locator('mark')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Próxima ocorrência' }).click();
  await expect(dialog.getByRole('status')).toContainText('2 de 2');
  await dialog.getByLabel('Ir para parágrafo').selectOption(f.document.anchors[1].id);
  await expect(dialog.getByLabel('Parágrafo 2', { exact: true })).toBeFocused();
  await dialog.getByLabel('Buscar no documento').fill('inexistente');
  await expect(dialog.getByRole('status')).toContainText('Nenhuma ocorrência');
  await expect(dialog.getByRole('button', { name: 'Próxima ocorrência' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: info.outputPath('reader-mobile.png') });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog.screenshot({ path: info.outputPath('reader-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(editor).toHaveValue('Minha importação ainda não salva.');
});

test('arquivo e lixeira permanecem legíveis; exclusão definitiva gera indisponibilidade sem texto antigo', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await login(page);
  await page.goto(`/app/casos?caso=${f.matter.id}`);
  const root = f.root + '/documents/' + f.document.document.id;
  for (const [action, revision, view, notice] of [
    ['archive', 0, 'archived', 'Arquivado'],
    ['trash', 1, 'trash', 'Na lixeira'],
  ] as const) {
    const response = await request.post(root + '/' + action, {
      headers,
      data: { expectedLifecycleRevision: revision },
    });
    expect(response.status(), await response.text()).toBe(200);
    await page.getByLabel('Mostrar documentos').selectOption(view);
    await page.getByRole('button', { name: 'Abrir documento: Contrato para leitura', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Leitura do documento' });
    await expect(dialog).toContainText(notice);
    await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveText(content);
    await dialog.getByRole('button', { name: 'Fechar leitura', exact: true }).click();
  }
  const purge = await request.post(root + '/purge', {
    headers,
    data: { expectedLifecycleRevision: 2, confirmation: f.document.document.id },
  });
  expect(purge.status(), await purge.text()).toBe(200);
  await page.getByRole('button', { name: 'Abrir documento: Contrato para leitura', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leitura do documento' });
  await expect(dialog.getByRole('alert')).toContainText('Documento indisponível');
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveCount(0);
  await expect(dialog).not.toContainText('obrigação contratual');
});

test('resposta atrasada de documento fechado não substitui outra leitura; falha permite tentar novamente', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const second = await request.post(f.root + '/documents', {
    headers,
    data: {
      title: 'Outro documento',
      originalFilename: 'outro.txt',
      mimeType: 'text/plain',
      content: 'Somente o segundo documento.',
    },
  });
  expect(second.status()).toBe(200);
  await login(page);
  await page.goto(`/app/casos?caso=${f.matter.id}`);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let finished!: () => void;
  const fulfilled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route(`**/documents/${f.document.document.id}/versions/*`, async (route) => {
    const response = await route.fetch();
    entered();
    await waiting;
    await route.fulfill({ response }).catch(() => undefined);
    finished();
  });
  await page.getByRole('button', { name: 'Abrir documento: Contrato para leitura', exact: true }).click();
  await started;
  await page.getByRole('button', { name: 'Fechar leitura', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir documento: Outro documento', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leitura do documento' });
  await expect(dialog).toContainText('Somente o segundo documento.');
  release();
  await fulfilled;
  await expect(dialog).not.toContainText('obrigação contratual');
  await dialog.getByRole('button', { name: 'Fechar leitura', exact: true }).click();
  const other = await second.json();
  await page.route(`**/documents/${other.document.id}/versions/*`, (route) =>
    route.fulfill({ status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' } }),
  );
  await page.getByRole('button', { name: 'Abrir documento: Outro documento', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveCount(0);
  await page.unroute(`**/documents/${other.document.id}/versions/*`);
  await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(dialog).toContainText('Somente o segundo documento.');
});

test('fonte citada abre a versão fixada e destaca âncora sem salvar a edição do rascunho', async ({
  page,
  request,
}, info) => {
  const f = await fixture(request);
  const state = await (await request.get(api + '/e2e/state')).json();
  const fact = await (await request.post(f.root + '/facts', {
    headers, data: { statement: 'Fato sintético para citação em edição.' },
  })).json();
  await login(page);
  await page.goto(`/app/casos?caso=${f.matter.id}`);
  await page.getByRole('button', { name: 'Usar este caso na IA', exact: true }).click();
  await page.getByLabel('Onde você vai usar?').selectOption('ChatGPT');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  await page.locator('dialog label').filter({ hasText: 'Contrato para leitura' }).getByRole('checkbox').check();
  await page.getByLabel('Permitir que esta IA envie textos ao editor').check();
  await page.getByLabel('Onde receber o texto?').selectOption('NEW');
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await page.getByRole('button', { name: 'Permitir acesso', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  const mcp = async (name: string, args: unknown) => {
    const response = await request.post(api + '/mcp', {
      headers: { authorization: 'Bearer ' + state.oauthTokens['app-one'] },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
    return body.result.structuredContent;
  };
  const manifest = await mcp('case.get_context', { matterId: f.matter.id });
  const receipt = await mcp('draft.save_from_ai', {
    matterId: f.matter.id,
    expectedGrantRevision: manifest.grantRevision,
    idempotencyKey: 'reader-source-' + Date.now(),
    title: 'Minuta com fonte',
    sections: [{ ordinal: 5, title: 'Fundamentos', content: 'Texto salvo para conferência.' }],
    references: [
      {
        sectionOrdinal: 5,
        kind: 'DOCUMENT',
        itemId: f.document.document.id,
        documentVersionId: f.document.version.id,
        anchorId: f.document.anchors[1].id,
        citationText: 'Cláusula de pagamento',
      },
    ],
  });
  await page.goto(receipt.openPath);
  const editor = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await expect(editor).toHaveValue('Texto salvo para conferência.');
  await page.getByRole('button', { name: 'Conferir rascunho', exact: true }).click();
  await editor.fill('Minha alteração ainda não salva.');
  await page.getByLabel('Título do rascunho', { exact: true }).fill('Título em edição');
  await page.getByLabel('Tipo de fonte da citação').selectOption('FACT');
  await page.getByLabel('Fonte da citação', { exact: true }).selectOption(fact.id);
  await page.getByLabel('Texto da citação').fill('Citação ainda não salva.');
  await page.getByRole('button', { name: 'Adicionar citação', exact: true }).click();
  let latestReads = 0;
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes++;
  });
  // A newer current document must never replace the pinned reference.
  await page.route(`**/documents/${f.document.document.id}`, (route) => {
    latestReads++;
    return route.fulfill({
      json: {
        ...f.document,
        version: {
          ...f.document.version,
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          versionNumber: 2,
          content: 'Conteúdo de outra versão.',
        },
      },
    });
  });
  const sources = page.getByRole('region', { name: 'Fontes documentais da versão salva' });
  await expect(sources).toContainText('Fundamentos');
  const source = sources.getByRole('button', { name: 'Conferir fonte', exact: true });
  await source.click();
  const dialog = page.getByRole('dialog', { name: 'Leitura do documento' });
  await expect(dialog).toContainText('Versão 1 · citada no rascunho');
  await expect(dialog.getByLabel('Parágrafo 2', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Parágrafo 2', { exact: true })).toHaveAttribute('data-cited', 'true');
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveText(content);
  await dialog.screenshot({ path: info.outputPath('pinned-source.png') });
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await expect(editor).toHaveValue('Minha alteração ainda não salva.');
  await expect(page.getByLabel('Título do rascunho', { exact: true })).toHaveValue('Título em edição');
  await expect(page.getByText('Seção 1 · Citação ainda não salva.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conferir rascunho', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Encaminhar à aprovação', exact: true })).toBeDisabled();
  // A review point offers the same complete reader, independent of the editor buffer.
  await page
    .getByRole('region', { name: 'Conferência do rascunho' })
    .locator('div')
    .filter({ has: page.getByText('Documento do caso localizado', { exact: true }) })
    .getByRole('button', { name: 'Ver ponto' })
    .click();
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveText(content);
  await page.keyboard.press('Escape');
  expect(latestReads).toBe(0);
  expect(writes).toBe(0);
  // A disappeared pinned version reports unavailability; it must never fall back to latest.
  await page.route(`**/documents/${f.document.document.id}/versions/${f.document.version.id}`, (route) =>
    route.fulfill({ status: 404, json: { error: 'DOCUMENT_NOT_FOUND' } }),
  );
  await source.click();
  await expect(dialog.getByRole('alert')).toContainText('Documento indisponível');
  await expect(dialog.getByRole('region', { name: 'Texto integral' })).toHaveCount(0);
  expect(latestReads).toBe(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveValue('Minha alteração ainda não salva.');
  await expect(page.getByText('Seção 1 · Citação ainda não salva.', { exact: true })).toBeVisible();
});
