import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
const api = 'http://127.0.0.1:3301';

test('conexões com o mesmo nome são distinguíveis e não recebem permissão automaticamente', async ({
  page,
  request,
}, info) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const created = await request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Conexões homônimas — teste sintético' },
  });
  expect(created.status()).toBe(200);
  const matter = await created.json();
  let writes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/ai-access') && r.method() === 'PUT') writes++;
  });
  await page.route('**/mcp/authorized-applications', async (route) => {
    const response = await route.fetch();
    const apps = await response.json();
    await route.fulfill({ response, json: apps.map((a: any) => ({ ...a, displayName: 'Claude' })) });
  });
  await login(page);
  await openCase(page, matter.id);
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  const choices = page.getByLabel('Aplicativo autorizado');
  await expect(choices).toHaveValue('');
  const options = await choices.locator('option').allTextContents();
  expect(options[1]).toContain('05/10/2026');
  expect(options[2]).toContain('05/10/2026');
  expect(options[1]).not.toBe(options[2]);
  await choices.selectOption('app-two');
  const selected = page.getByRole('region', { name: 'Conexão escolhida' });
  await expect(selected).toContainText('Sem acesso a este caso');
  await expect(selected).toContainText('Autorizada em');
  await selected.getByText('Detalhes da conexão', { exact: true }).click();
  await expect(selected).toContainText('app-two');
  await page.getByText('Reconectou sua IA?', { exact: true }).click();
  await expect(
    page.getByText('As permissões do caso não são transferidas entre conexões.', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const axe = await new AxeBuilder({ page })
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.locator('dialog').screenshot({ path: info.outputPath('connection-identity-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('dialog').screenshot({ path: info.outputPath('connection-identity-desktop.png') });
  expect(writes).toBe(0);
  expect(await (await request.get(api + `/api/v2/matters/${matter.id}/ai-access`, { headers })).json()).toEqual([]);
  expectCaseDenied(await mcp(request, state.oauthTokens['app-two'], 'case.get_context', { matterId: matter.id }));
});

test('atualizar conexão renovada invalida a prévia sem descartar material nem autorizar acesso', async ({
  page,
  request,
}) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const created = await request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Renovação de conexão — teste sintético' },
  });
  expect(created.status()).toBe(200);
  const matter = await created.json();
  const document = await request.post(api + `/api/v2/matters/${matter.id}/documents`, {
    headers,
    data: {
      title: 'Material da renovação',
      originalFilename: 'teste.txt',
      mimeType: 'text/plain',
      content: 'Conteúdo inteiramente fictício para seleção.',
    },
  });
  expect(document.status()).toBe(200);
  let renewed = false;
  let available = true;
  let writes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/ai-access') && r.method() === 'PUT') writes++;
  });
  await page.route('**/mcp/authorized-applications', async (route) => {
    const response = await route.fetch();
    const apps = await response.json();
    await route.fulfill({
      response,
      json: apps
        .filter((a: any) => available || a.clientId !== 'app-one')
        .map((a: any) => (a.clientId === 'app-one' && renewed ? { ...a, grantedAt: '2026-10-07T16:00:00.000Z' } : a)),
    });
  });
  await login(page);
  await openCase(page, matter.id);
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  const choice = page.locator('dialog label').filter({ hasText: 'Material da renovação' }).getByRole('checkbox');
  await choice.check();
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeEnabled();
  renewed = true;
  await page.getByRole('button', { name: 'Atualizar permissões', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prévia do material' })).toHaveCount(0);
  await expect(choice).toBeChecked();
  await expect(page.getByRole('region', { name: 'Conexão escolhida' })).toContainText('07/10/2026');
  await expect(page.getByRole('status')).toContainText('Confira a conexão e a prévia');
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeEnabled();
  available = false;
  await page.getByRole('button', { name: 'Atualizar permissões', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prévia do material' })).toHaveCount(0);
  await expect(choice).toBeChecked();
  await expect(page.getByRole('region', { name: 'Conexão escolhida' })).toContainText('Conexão indisponível');
  await expect(page.getByRole('button', { name: 'Ver prévia', exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  expect(await (await request.get(api + `/api/v2/matters/${matter.id}/ai-access`, { headers })).json()).toEqual([]);
  expectCaseDenied(await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: matter.id }));
});

test('permissão anterior fica identificada após renovação e pode ser revogada sem ser transferida', async ({
  page,
  request,
}) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const created = await request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Permissão anterior — teste sintético' },
  });
  expect(created.status()).toBe(200);
  const matter = await created.json();
  const docResponse = await request.post(api + `/api/v2/matters/${matter.id}/documents`, {
    headers,
    data: {
      title: 'Documento da permissão anterior',
      originalFilename: 'permissao.txt',
      mimeType: 'text/plain',
      content: 'Conteúdo fictício para conferir a permissão anterior.',
    },
  });
  expect(docResponse.status()).toBe(200);
  const doc = await docResponse.json();
  const base = api + `/api/v2/matters/${matter.id}/ai-access`;
  const granted = await request.put(base, {
    headers,
    data: {
      oauthClientId: 'app-one',
      expectedRevision: 0,
      selection: {
        documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
        factIds: [],
        evidenceIds: [],
        thesisIds: [],
        authorityIds: [],
      },
    },
  });
  expect(granted.status()).toBe(200);
  const grant = await granted.json();
  let renewed = false;
  let writes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/ai-access') && r.method() === 'PUT') writes++;
  });
  await page.route('**/mcp/authorized-applications', async (route) => {
    const response = await route.fetch();
    const apps = await response.json();
    await route.fulfill({
      response,
      json: apps.map((a: any) => ({
        ...a,
        displayName: 'Claude',
        ...(a.clientId === 'app-one' && renewed ? { grantedAt: '2026-10-07T16:00:00.000Z' } : {}),
      })),
    });
  });
  await login(page);
  await openCase(page, matter.id);
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await expect(page.getByRole('button', { name: 'Copiar instrução', exact: true })).toBeVisible();
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  const selectedDocument = page
    .locator('dialog label')
    .filter({ hasText: 'Documento da permissão anterior' })
    .getByRole('checkbox');
  await expect(selectedDocument).toBeChecked();
  renewed = true;
  await page.getByRole('button', { name: 'Atualizar permissões', exact: true }).click();
  const chosen = page.getByRole('region', { name: 'Conexão escolhida' });
  await expect(chosen).toContainText('Conexão renovada; revise a permissão');
  await expect(chosen).toContainText('07/10/2026');
  await expect(selectedDocument).toBeChecked();
  await expect(page.getByRole('button', { name: 'Copiar instrução', exact: true })).toHaveCount(0);
  const permission = page.getByRole('region', { name: 'Permissões da IA' });
  await expect(permission).toContainText('05/10/2026');
  await permission.getByRole('button', { name: 'Revogar acesso', exact: true }).click();
  const confirmation = page
    .locator('dialog div')
    .filter({ hasText: 'Bloquear novas consultas desta conexão a este caso?' })
    .last();
  await expect(confirmation).toContainText('05/10/2026');
  await page.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Impede novas consultas');
  const grants = await (await request.get(base, { headers })).json();
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({
    id: grant.id,
    oauthClientId: 'app-one',
    oauthGrantedAt: '2026-10-05T10:00:00.000Z',
    status: 'REVOKED',
  });
  expect(writes).toBe(0);
  expectCaseDenied(await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: matter.id }));
  expectCaseDenied(await mcp(request, state.oauthTokens['app-two'], 'case.get_context', { matterId: matter.id }));
});

test('novo rascunho abre pelo recibo sem referências nem revisão automática', async ({ page, request }) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  await login(page);
  await openCase(page, state.matterId);
  await select(page);
  await page.getByLabel('Permitir que esta IA envie textos ao editor').check();
  await page.getByLabel('Onde receber o texto?').selectOption('NEW');
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  const allow = page.getByRole('button', { name: /^(Permitir acesso|Salvar permissão)$/ });
  await allow.click();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  const manifest = await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: state.matterId });
  const input = {
    matterId: state.matterId,
    expectedGrantRevision: manifest.result.structuredContent.grantRevision,
    idempotencyKey: 'new-browser-' + Date.now(),
    title: 'Novo texto sem fontes',
    sections: [{ ordinal: 5, title: 'Fatos', content: 'Texto ainda não conferido.' }],
    references: [],
  };
  const saved = await mcp(request, state.oauthTokens['app-one'], 'draft.save_from_ai', input);
  expect(saved.result.isError).toBe(false);
  const factResponse = await request.post(`${api}/api/v2/matters/${state.matterId}/facts`, {
    headers: { authorization: 'Bearer phase7-e2e-access-token' },
    data: { statement: 'Fato sintético para referência ordinal.' },
  });
  expect(factResponse.status()).toBe(200);
  const fact = await factResponse.json();
  await page.goto(saved.result.structuredContent.openPath);
  await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true })).toHaveValue(
    input.sections[0].content,
  );
  await expect(page.getByRole('region', { name: 'Textos recebidos da IA' })).toContainText('Texto recebido da IA');
  const details = await (
    await request.get(`${api}/api/v2/matters/${state.matterId}/drafts/${saved.result.structuredContent.draftId}`, {
      headers: { authorization: 'Bearer phase7-e2e-access-token' },
    })
  ).json();
  expect(details.currentVersion.version.status).toBe('DRAFT');
  expect(details.currentReviewRun).toBeUndefined();
  expect(details.documentReferences).toEqual([]);
  await page.getByLabel('Tipo de fonte da citação').selectOption('FACT');
  await page.getByLabel('Fonte da citação', { exact: true }).selectOption(fact.id);
  await page.getByLabel('Texto da citação').fill('Fonte conferida nesta seção.');
  await page.getByRole('button', { name: 'Adicionar citação', exact: true }).click();
  const versionResponse = page.waitForResponse((r) => r.url().endsWith('/versions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar nova versão', exact: true }).click();
  expect((await versionResponse).status()).toBe(200);
  await expect(page.getByText('Seção 1 · Fonte conferida nesta seção.', { exact: true })).toBeVisible();
});
test('receber texto preserva edição, permite prévia segura e exige adoção consciente', async ({ page, request }) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const root = `/api/v2/matters/${state.matterId}`;
  await login(page);
  const creation = await request.post(api + root + '/drafts', {
    headers: { authorization: 'Bearer phase7-e2e-access-token' },
    data: {
      title: 'Rascunho para recebimento',
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto original preservado.' }],
    },
  });
  expect(creation.status(), await creation.text()).toBe(200);
  const draft = await creation.json();
  await openCase(page, state.matterId);
  await select(page);
  await page.getByLabel('Permitir que esta IA envie textos ao editor').check();
  await page.getByLabel('Onde receber o texto?').selectOption(draft.draft.id);
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await page.getByRole('button', { name: 'Permitir acesso', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  const manifest = await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: state.matterId });
  expect(manifest.result.structuredContent.draftReceiving.destination.draftId).toBe(draft.draft.id);
  await page.goto(`/app/rascunhos?matterId=${state.matterId}&draftId=${draft.draft.id}`);
  const editor = page.getByRole('textbox', { name: 'Conteúdo da seção 1', exact: true });
  await expect(editor).toHaveValue('Texto original preservado.');
  const input = {
    matterId: state.matterId,
    expectedGrantRevision: manifest.result.structuredContent.grantRevision,
    idempotencyKey: 'browser-receipt-' + Date.now(),
    title: 'Texto da IA',
    sections: [{ ordinal: 0, title: 'Fatos', content: '<script>window.receiptExecuted=true</script> Texto recebido' }],
    references: manifest.result.structuredContent.items
      .filter((i: any) => i.kind === 'DOCUMENT')
      .map((i: any) => ({ sectionOrdinal: 0, kind: 'DOCUMENT', itemId: i.id, documentVersionId: i.versionId })),
  };
  const saved = await mcp(request, state.oauthTokens['app-one'], 'draft.save_from_ai', input);
  expect(saved.result.isError).toBe(false);
  expect(
    (await mcp(request, state.oauthTokens['app-one'], 'draft.save_from_ai', input)).result.structuredContent.id,
  ).toBe(saved.result.structuredContent.id);
  await page.getByRole('button', { name: 'Atualizar textos recebidos' }).click();
  const panel = page.getByRole('region', { name: 'Textos recebidos da IA' });
  await expect(panel).toContainText('Texto recebido da IA — Aguardando revisão');
  await expect(editor).toHaveValue('Texto original preservado.');
  await panel.getByRole('button', { name: 'Ver texto recebido', exact: true }).click();
  await expect(panel).toContainText('<script>window.receiptExecuted=true</script>');
  expect(await page.evaluate(() => Boolean((window as any).receiptExecuted))).toBe(false);
  const firstConcurrent = await request.post(api + root + '/drafts/' + draft.draft.id + '/versions', {
    headers: { authorization: 'Bearer phase7-e2e-access-token' },
    data: {
      title: 'Rascunho para recebimento',
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Outra versão salva por uma aba.' }],
    },
  });
  expect(firstConcurrent.status()).toBe(200);
  await panel.getByRole('button', { name: 'Usar esta versão', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('A edição atual mudou');
  await expect(editor).toHaveValue('Texto original preservado.');
  await expect(page.getByRole('button', { name: 'Conferir rascunho', exact: true })).toBeDisabled();
  await editor.fill('Minha edição ainda não salva.');
  await panel.getByRole('button', { name: 'Usar esta versão', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Continuar editando' })).toBeVisible();
  await panel.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(editor).toHaveValue('Minha edição ainda não salva.');
  const concurrent = await request.post(api + root + '/drafts/' + draft.draft.id + '/versions', {
    headers: { authorization: 'Bearer phase7-e2e-access-token' },
    data: {
      title: 'Rascunho para recebimento',
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Edição de outra aba.' }],
    },
  });
  expect(concurrent.status()).toBe(200);
  await panel.getByRole('button', { name: 'Usar esta versão', exact: true }).click();
  await panel.getByRole('button', { name: 'Descartar minha edição e usar' }).click();
  await expect(panel.getByRole('alert')).toContainText('A edição atual mudou');
  await expect(editor).toHaveValue('Minha edição ainda não salva.');
  await panel.getByRole('button', { name: 'Salvar minha edição e usar' }).click();
  await expect(editor).toHaveValue(input.sections[0].content);
  const versions = (
    await (
      await request.get(api + root + '/drafts/' + draft.draft.id, {
        headers: { authorization: 'Bearer phase7-e2e-access-token' },
      })
    ).json()
  ).versions;
  expect(versions).toHaveLength(5);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar DOCX da versão salva' }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloading).path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('Contrato selecionável');
  expect(xml).toContain('· versão 1 · Pendente de conferência');
  expect(xml).toContain('Pendente de conferência');
});
async function login(page: Page) {
  const bootstrap = page.waitForResponse(
    (r) => r.url().endsWith('/api/v2/auth/bootstrap') && r.request().method() === 'POST',
  );
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('contexto@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);
  await page.waitForURL('**/app');
}
async function openCase(page: Page, id: string) {
  await page.goto(`/app/casos?caso=${id}`);
  await page.getByRole('button', { name: 'Usar este caso na IA' }).click();
  await expect(page.getByRole('button', { name: 'Atualizar permissões' })).toBeEnabled();
}
async function select(page: Page) {
  await page.getByLabel('Onde você vai usar?').selectOption('ChatGPT');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  await page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox').check();
}
async function mcp(request: APIRequestContext, token: string, name: string, args: unknown = {}) {
  const r = await request.post(api + '/mcp', {
    headers: { authorization: 'Bearer ' + token },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
function expectCaseDenied(reply: any) {
  expect(reply).not.toHaveProperty('error');
  expect(reply.result.isError).toBe(true);
  expect(reply.result).not.toHaveProperty('structuredContent');
  expect(reply.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0, isReplay: false });
  expect(JSON.parse(reply.result.content[0].text).error).toMatchObject({
    code: 'CASE_CONTEXT_NOT_AUTHORIZED',
    message: expect.stringContaining('Este material não está autorizado para o aplicativo.'),
  });
}
test('prévia, permissão gratuita, seleção explícita e revogação persistida', async ({ page, request }, info) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  await login(page);
  await openCase(page, state.matterId);
  await expect(page.getByLabel('Aplicativo autorizado')).toHaveValue('');
  await select(page);
  // Select by document identity rather than catalogue order.
  const wanted = page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox');
  await page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox').uncheck();
  await wanted.check();
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prévia do material' })).toContainText(
    'Conteúdo reservado selecionado',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('dialog').screenshot({ path: info.outputPath('case-ai-mobile.png') });
  expect(await page.locator('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const axe = await new AxeBuilder({ page })
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('dialog').screenshot({ path: info.outputPath('case-ai-desktop.png') });
  await page.getByRole('button', { name: 'Permitir acesso', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  const read = await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
    matterId: state.matterId,
    kind: 'DOCUMENT',
    itemId: state.documentId,
  });
  expect(read.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0, isReplay: false });
  expect(read.result.billing).not.toHaveProperty('remainingBalanceCents');
  expect(JSON.stringify(read)).toContain('Conteúdo reservado selecionado');
  expectCaseDenied(await mcp(request, state.oauthTokens['app-two'], 'case.get_context', { matterId: state.matterId }));
  expectCaseDenied(
    await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
      matterId: state.matterId,
      kind: 'DOCUMENT',
      itemId: state.hiddenDocumentId,
    }),
  );
  // A document added after permission is not automatically shared.
  const extra = await request.post(api + `/api/v2/matters/${state.matterId}/documents`, {
    headers: { authorization: 'Bearer phase7-e2e-access-token' },
    data: {
      title: 'Documento posterior',
      originalFilename: 'novo.txt',
      mimeType: 'text/plain',
      content: 'NÃO COMPARTILHADO',
    },
  });
  expect(extra.status()).toBe(200);
  const added = await extra.json();
  expectCaseDenied(
    await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
      matterId: state.matterId,
      kind: 'DOCUMENT',
      itemId: added.document.id,
    }),
  );
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Usar este caso na IA' })).toBeFocused();
  await page.reload();
  await openCase(page, state.matterId);
  await expect(page.getByText('Minha conexão de teste — Acesso permitido')).toBeVisible();
  await page.getByRole('button', { name: 'Revogar acesso', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar revogação' }).click();
  await expect(page.getByRole('status')).toContainText('Impede novas consultas');
  expectCaseDenied(
    await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
      matterId: state.matterId,
      kind: 'DOCUMENT',
      itemId: state.documentId,
      cursor: read.result.structuredContent.nextCursor,
    }),
  );
  await page.reload();
  await openCase(page, state.matterId);
  await expect(page.getByText('Minha conexão de teste — Acesso revogado')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});
test('erro mantém seleção; resposta atrasada não atravessa o caso', async ({ page, request }) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  await login(page);
  await openCase(page, state.otherMatterId);
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-two');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await openCase(page, state.matterId);
  await select(page);
  await page.route('**/ai-access/preview', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'CASE_ACCESS_UNAVAILABLE' }),
    }),
  );
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sua escolha foi mantida');
  await expect(
    page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox'),
  ).toBeChecked();
  await page.unroute('**/ai-access/preview');
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeEnabled();
  // Delay a real preview response; close, then open a different case.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route('**/ai-access/preview', async (route) => {
    const response = await route.fetch();
    entered();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await started;
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await openCase(page, state.otherMatterId);
  release();
  await expect(page.getByLabel('Aplicativo autorizado')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Prévia do material' })).toHaveCount(0);
  await expect(page.locator('dialog')).toContainText('Outro caso E2E');
  await page.unroute('**/ai-access/preview');
});
test('conflito real exige atualização explícita e impede escrita duplicada', async ({ page, request }) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  await login(page);
  await openCase(page, state.matterId);
  await select(page);
  await page.getByRole('button', { name: 'Ver prévia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeEnabled();
  const base = api + `/api/v2/matters/${state.matterId}/ai-access`;
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const grants = await (await request.get(base, { headers })).json();
  const revision = grants.find((g: any) => g.oauthClientId === 'app-one')?.revision ?? 0;
  const changed = await request.put(base, {
    headers,
    data: {
      oauthClientId: 'app-one',
      expectedRevision: revision,
      selection: {
        documents: [
          {
            documentId: state.documentId,
            versionId: (await (await request.get(base + '/materials?kind=DOCUMENT', { headers })).json()).items.find(
              (i: any) => i.id === state.documentId,
            ).versionId,
          },
        ],
        factIds: [],
        evidenceIds: [],
        thesisIds: [],
        authorityIds: [],
      },
    },
  });
  expect(changed.status()).toBe(200);
  await page.getByRole('button', { name: 'Permitir acesso', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sua escolha foi mantida');
  await expect(
    page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox'),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Atualizar permissões' }).click();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let writes = 0;
  await page.route('**/ai-access', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    const response = await route.fetch();
    entered();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Permitir acesso', exact: true }).click();
  await started;
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Permitir acesso', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  expect(writes).toBe(1);
  await page.unroute('**/ai-access');
});
