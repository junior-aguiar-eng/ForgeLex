import { expect, test, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:3311/api/v2';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };

async function openNewPiece(page: Page) {
  const created = await page.request.post(`${api}/matters`, {
    headers,
    data: { title: 'Caso do salvamento recuperável' },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('salvamento@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto(`/app/trabalho?matterId=${id}`);
  const piece = page.getByRole('region', { name: 'Mesa da peça' });
  await piece.getByLabel('Título da peça').fill('Minuta com salvamento recuperável');
  const text = piece.getByLabel('Texto da seção 1');
  await text.fill('Texto que deve ser recuperado após o commit.');
  return { piece, text, base: `${api}/matters/${id}/drafts` };
}

test('recupera resposta perdida após commit sem repetir o POST', async ({ page }) => {
  const { piece, text, base } = await openNewPiece(page);
  let posts = 0;
  let commandId = '';
  await page.route(base, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    commandId = route.request().postDataJSON().commandId;
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    await route.abort('failed');
  });
  const recovered = page.waitForResponse((response) => response.url().includes('/draft-save-commands/'));
  await piece.getByRole('button', { name: 'Salvar', exact: true }).click();
  expect((await recovered).ok()).toBe(true);
  expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(piece.getByText('Salvamento recuperado.')).toBeVisible();
  await expect(text).toHaveValue('Texto que deve ser recuperado após o commit.');
  const { items } = await (await page.request.get(base, { headers })).json();
  expect(items).toHaveLength(1);
  const detail = await (await page.request.get(`${base}/${items[0].id}`, { headers })).json();
  expect(detail.versions).toHaveLength(1);
  expect(posts).toBe(1);
});

test('reabre a Mesa e recupera o recibo mantendo só o identificador pendente na sessão', async ({ page }) => {
  const { piece, text, base } = await openNewPiece(page);
  let posts = 0;
  let commandId = '';
  await page.route(base, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    commandId = route.request().postDataJSON().commandId;
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort('failed');
  });
  const receipt = '**/draft-save-commands/*';
  await page.route(receipt, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: 'API_UNAVAILABLE',
        message: 'Consulta temporariamente indisponível.',
      },
    }),
  );
  await piece.getByRole('button', { name: 'Salvar', exact: true }).click();
  const recover = page.getByRole('button', { name: 'Recuperar salvamento', exact: true });
  await expect(recover).toBeEnabled();
  const values = await page.evaluate(() =>
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('forgelex:pending-draft-save:'))
      .map((key) => sessionStorage.getItem(key)),
  );
  expect(values).toEqual([commandId]);
  await page.unroute(receipt);
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.reload();
  await expect(recover).toBeEnabled();
  await recover.click();
  await expect(text).toHaveValue('Texto que deve ser recuperado após o commit.');
  await expect(recover).toHaveCount(0);
  expect(posts).toBe(1);
  const { items } = await (await page.request.get(base, { headers })).json();
  expect(items).toHaveLength(1);
});

test('consulta o recibo antes de reenviar a tentativa e preserva a edição feita depois', async ({ page }) => {
  const { piece, text, base } = await openNewPiece(page);
  const requests: { commandId: string; content: string }[] = [];
  await page.route(base, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const input = route.request().postDataJSON();
    requests.push({ commandId: input.commandId, content: input.sections[0].content });
    if (requests.length === 1) await route.abort('failed');
    else await route.continue();
  });
  const order: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/draft-save-commands/')) order.push('GET');
    if (request.url() === base && request.method() === 'POST') order.push('POST');
  });
  const save = piece.getByRole('button', { name: 'Salvar', exact: true });
  await save.click();
  await expect(piece.getByRole('alert')).toContainText('Salvamento sem confirmação');
  await text.fill('Edição feita depois da primeira tentativa.');
  await save.click();
  await expect(piece.getByText('Salvamento recuperado.')).toBeVisible();
  expect(order).toEqual(['POST', 'GET', 'GET', 'POST']);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(text).toHaveValue('Edição feita depois da primeira tentativa.');
  const { items } = await (await page.request.get(base, { headers })).json();
  expect(items).toHaveLength(1);
  const next = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/versions'),
  );
  await save.click();
  const saved = await next;
  expect(saved.ok()).toBe(true);
  expect(saved.request().postDataJSON().commandId).not.toBe(requests[0].commandId);
  const detail = await (await page.request.get(`${base}/${items[0].id}`, { headers })).json();
  expect(detail.versions).toHaveLength(2);
  expect(detail.currentVersion.sections[0].content).toBe('Edição feita depois da primeira tentativa.');
});
