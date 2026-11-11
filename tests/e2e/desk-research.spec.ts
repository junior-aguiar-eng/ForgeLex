import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'http://127.0.0.1:3551/api/v2';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('mesa-fontes@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-local-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

async function savedSearch(request: APIRequestContext, query: string) {
  const operationId = randomUUID();
  const search = await request.post(`${api}/research/search-case-law`, {
    headers: { ...headers, 'Idempotency-Key': operationId },
    data: { query, court: 'STJ', limit: 3 },
  });
  expect(search.ok()).toBe(true);
  const saved = await request.post(`${api}/research/saved`, { headers, data: { operationId } });
  expect(saved.ok()).toBe(true);
  const { id } = await saved.json();
  return { id, operationId, copy: await (await request.get(`${api}/research/saved/${id}`, { headers })).json() };
}

test('abre pesquisa conservada na Mesa e vincula ao destino escolhido sem perder a peça', async ({ page, request }) => {
  const createMatter = async (title: string) => {
    const response = await request.post(`${api}/matters`, { headers, data: { title } });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const pieceMatter = await createMatter('Caso da peça de pesquisa');
  const destination = await createMatter('Destino escolhido para o julgado');
  const { draft, version } = await (
    await request.post(`${api}/matters/${pieceMatter.id}/drafts`, {
      headers,
      data: { title: 'Peça aberta', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto salvo.' }] },
    })
  ).json();
  const { id, operationId, copy } = await savedSearch(request, 'civil');
  expect(copy.results.items.length).toBeGreaterThan(0);

  await login(page);
  await page.goto(
    `/app/trabalho?${new URLSearchParams({ matterId: pieceMatter.id, draftId: draft.id, versionId: version.id })}`,
  );
  const piece = page.getByRole('textbox', { name: 'Texto da seção 1' });
  await piece.fill('Texto local ainda não salvo.');
  const location = page.url();
  let searches = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/research/search-case-law')) searches++;
  });
  await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pesquisa e fontes' });
  const saved = dialog.getByRole('region', { name: 'Pesquisas salvas' });
  const result = saved.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'civil', exact: true }) });
  await result.getByRole('button', { name: 'Abrir', exact: true }).click();
  const reader = saved.getByRole('region', { name: 'Leitor de decisões' });
  await expect(reader.getByText(/Resultados da pesquisa realizada em/)).toBeVisible();
  expect(searches).toBe(0);
  await reader.getByRole('button', { name: 'Salvar no caso' }).click();
  const save = page.getByRole('dialog', { name: 'Salvar julgado no caso' });
  await expect(save.getByRole('button', { name: 'Salvar julgado', exact: true })).toBeDisabled();
  await save.getByLabel('Caso de destino').selectOption(destination.id);
  await save.getByRole('button', { name: 'Salvar julgado', exact: true }).click();
  await expect(save.getByRole('status')).toHaveText('Julgado salvo no caso.');
  await save.getByRole('button', { name: 'Fechar' }).click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(piece).toHaveValue('Texto local ainda não salvo.');
  expect(page.url()).toBe(location);
  const savedAuthorities = await (
    await request.get(`${api}/matters/${destination.id}/authorities`, { headers })
  ).json();
  expect(savedAuthorities.items[0].authority).toEqual(copy.results.items[0]);
  const pieceAuthorities = await (
    await request.get(`${api}/matters/${pieceMatter.id}/authorities`, { headers })
  ).json();
  expect(pieceAuthorities.items).toHaveLength(0);
  expect(searches).toBe(0);

  const linked = await request.post(`${api}/matters/${pieceMatter.id}/authorities`, {
    headers,
    data: { authority: copy.results.items[0] },
  });
  expect(linked.ok()).toBe(true);
  await page.getByRole('button', { name: 'Fontes do caso', exact: true }).click();
  const sources = page.getByRole('dialog', { name: 'Fontes do caso' });
  await expect(sources.getByText(copy.results.items[0].processNumber, { exact: true })).toBeVisible();
  await expect(sources.getByText('Identidade do julgado.')).toBeVisible();
  await expect(sources.getByText('Fidelidade da citação.')).toBeVisible();
  await expect(sources.getByText('Aplicabilidade ao caso.')).toBeVisible();
  await sources.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(piece).toHaveValue('Texto local ainda não salvo.');
  expect(page.url()).toBe(location);

  await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
  await result.getByRole('button', { name: 'Pesquisar novamente' }).click();
  const confirm = page.getByRole('dialog', { name: 'Pesquisar novamente' });
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect(searches).toBe(0);
  await result.getByRole('button', { name: 'Pesquisar novamente' }).click();
  const dispatched = page.waitForRequest(
    (req) => req.url().endsWith('/research/search-case-law') && req.method() === 'POST',
  );
  await confirm.getByRole('button', { name: 'Executar nova pesquisa' }).click();
  const rerun = await dispatched;
  expect(rerun.headers()['idempotency-key']).not.toBe(operationId);
  expect(rerun.postDataJSON()).toMatchObject({ query: 'civil', court: 'STJ', limit: 3 });
  await expect(confirm).toHaveCount(0);
  expect(searches).toBe(1);
  const conserved = await (await request.get(`${api}/research/saved/${id}`, { headers })).json();
  expect(conserved.results).toEqual(copy.results);
});

test('trata tribunal desabilitado, fonte ausente e acesso revogado sem substituir a cópia', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { id, copy } = await savedSearch(request, 'vazamento');
  await page.route('**/api/v2/tribunals', (route) =>
    route.fulfill({ json: { tribunals: [{ code: 'STJ', searchable: false }] } }),
  );
  let mode: 'old' | 'unavailable' | 'revoked' = 'old';
  await page.route(`**/api/v2/research/saved/${id}`, (route) => {
    if (mode === 'revoked')
      return route.fulfill({ status: 403, json: { error: 'FORBIDDEN', message: 'Acesso à pesquisa revogado.' } });
    return route.fulfill({
      json: {
        ...copy,
        searchedAt: '2024-07-10T13:00:00.000Z',
        results: mode === 'unavailable' ? { ...copy.results, items: [null] } : copy.results,
      },
    });
  });
  await login(page);
  await page.goto('/app/trabalho');
  let searches = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/research/search-case-law')) searches++;
  });
  await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pesquisa e fontes' });
  const saved = dialog.getByRole('region', { name: 'Pesquisas salvas' });
  const result = saved
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'vazamento', exact: true }) });
  await expect(result.getByRole('button', { name: 'Pesquisar novamente' })).toBeDisabled();
  await result.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(saved.getByText(/Resultados da pesquisa realizada em 10\/07\/2024/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  mode = 'unavailable';
  await result.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(saved.getByText(/A versão desta decisão não está disponível/)).toBeVisible();
  await expect(saved.getByRole('button', { name: 'Salvar no caso' })).toHaveCount(0);
  mode = 'revoked';
  await result.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(saved.getByRole('alert')).toContainText('Acesso à pesquisa revogado.');
  await expect(saved.getByRole('region', { name: 'Leitor de decisões' })).toHaveCount(0);
  await expect(result).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.route('**/api/v2/research/saved', (route) => route.fulfill({ status: 404 }));
  await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
  await expect(saved.getByRole('alert')).toContainText('Pesquisas salvas estão indisponíveis.');
  await expect(saved.getByRole('button', { name: 'Abrir', exact: true })).toHaveCount(0);
  expect(searches).toBe(0);
});
