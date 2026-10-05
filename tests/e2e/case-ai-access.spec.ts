import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301';
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
  await page.getByRole('checkbox').first().check();
}
async function mcp(request: APIRequestContext, token: string, name: string, args: unknown = {}) {
  const r = await request.post(api + '/mcp', {
    headers: { authorization: 'Bearer ' + token },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
test('prévia, permissão gratuita, seleção explícita e revogação persistida', async ({ page, request }, info) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  await login(page);
  await openCase(page, state.matterId);
  await expect(page.getByLabel('Aplicativo autorizado')).toHaveValue('');
  await select(page);
  // Select by document identity rather than catalogue order.
  const wanted = page.locator('dialog label').filter({ hasText: 'Contrato selecionável' }).getByRole('checkbox');
  await page.getByRole('checkbox').first().uncheck();
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
  expect(
    (await mcp(request, state.oauthTokens['app-two'], 'case.get_context', { matterId: state.matterId })).error,
  ).toBeTruthy();
  expect(
    (
      await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
        matterId: state.matterId,
        kind: 'DOCUMENT',
        itemId: state.hiddenDocumentId,
      })
    ).error,
  ).toBeTruthy();
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
  expect(
    (
      await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
        matterId: state.matterId,
        kind: 'DOCUMENT',
        itemId: added.document.id,
      })
    ).error,
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Usar este caso na IA' })).toBeFocused();
  await page.reload();
  await openCase(page, state.matterId);
  await expect(page.getByText('Minha conexão de teste — Acesso permitido')).toBeVisible();
  await page.getByRole('button', { name: 'Revogar acesso', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar revogação' }).click();
  await expect(page.getByRole('status')).toContainText('Impede novas consultas');
  expect(
    (
      await mcp(request, state.oauthTokens['app-one'], 'case.read_item', {
        matterId: state.matterId,
        kind: 'DOCUMENT',
        itemId: state.documentId,
        cursor: read.result.structuredContent.nextCursor,
      })
    ).error,
  ).toBeTruthy();
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
  await expect(page.getByRole('checkbox').first()).toBeChecked();
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
  await expect(page.getByRole('checkbox').first()).toBeChecked();
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
