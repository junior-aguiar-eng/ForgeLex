import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function openDesk(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

const help = (page: Page) => page.getByRole('button', { name: 'Me ajude a começar' });
const question = (page: Page) => page.getByRole('region', { name: 'Pergunta do pedido' });
const summary = (page: Page) => page.getByRole('region', { name: 'Resumo do pedido' });
async function choose(page: Page, option: string) {
  await question(page).getByRole('radio', { name: option, exact: true }).press('Space');
  await question(page).getByRole('button', { name: 'Continuar', exact: true }).press('Enter');
}

const api = 'http://127.0.0.1:3311/api';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const privateSkill =
  /skill-r13-forma-privada|Título reservado R13|Corpo reservado R13|catalogo-r13-sintetico|"(?:skillSnapshot|skillReferences|skillBinding|guidanceHash)"/;

async function exerciseDesk(page: Page, mobile: boolean) {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 });
  const switchPanel = async (name: 'Conversa' | 'Peça') => {
    if (mobile)
      await page
        .getByRole('navigation', { name: 'Áreas da mesa' })
        .getByRole('button', { name, exact: true })
        .press('Enter');
  };
  const matterResponse = await page.request.post(`${api}/v2/matters`, {
    headers,
    data: { title: 'Caso da regressão integrada R13' },
  });
  expect(matterResponse.ok()).toBe(true);
  const { id: matterId } = await matterResponse.json();
  const readPublic = async (path: string) => {
    const response = await page.request.get(api + path, { headers });
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).not.toMatch(privateSkill);
    return JSON.parse(body);
  };
  const send = async () => {
    const created = page.waitForResponse(
      (response) => response.url() === `${api}/agentic/executions` && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Enviar', exact: true }).press('Enter');
    const response = await created;
    const body = await response.text();
    expect(response.status(), body).toBe(202);
    expect(body).not.toMatch(privateSkill);
    const run = JSON.parse(body);
    const path = `/agentic/executions/${run.id}`;
    await expect.poll(async () => (await readPublic(path)).status).toBe('COMPLETED');
    const completed = await readPublic(path);
    for (const id of completed.deliveryIds) await readPublic(`/agentic/deliveries/${id}`);
    return { completed, payload: response.request().postDataJSON() };
  };

  await openDesk(page);
  await page.getByRole('button', { name: 'Sem caso', exact: true }).click();
  await page.getByLabel('Caso (opcional)').selectOption(matterId);
  const message = page.getByRole('textbox', { name: 'O que você precisa fazer?' });
  await message.fill('Redigir a contestação com base no relato FLUXO_MESA R13.');
  await help(page).press('Enter');
  await expect(question(page).locator('legend')).toBeFocused();
  await choose(page, 'Cível');
  await choose(page, 'Elaborar uma peça');
  await choose(page, 'Contestação');
  const { completed: creation } = await send();
  expect(creation.matterId).toBe(matterId);
  expect(creation.deliveryIds.length).toBeGreaterThan(0);
  await readPublic(`/agentic/guidance/${creation.conversationId}`);
  const stream = await page.request.get(`${api}/agentic/executions/${creation.id}/events`, { headers, timeout: 5000 });
  expect(stream.ok()).toBe(true);
  const events = await stream.text();
  expect(events).toContain('event: delivery');
  expect(events).not.toMatch(privateSkill);

  await switchPanel('Conversa');
  const article = page.getByRole('article', { name: 'Resultado do trabalho' });
  await expect(article).toContainText('Manifestação sintética da mesa');
  expect(await page.locator('body').innerHTML()).not.toMatch(privateSkill);
  const draftsPath = `/v2/matters/${matterId}/drafts`;
  const {
    items: [draft],
  } = await readPublic(draftsPath);
  const draftPath = `${draftsPath}/${draft.id}`;
  const { currentVersion: original } = await readPublic(draftPath);
  const piece = page.getByRole('textbox', { name: 'Texto da seção 1' });
  await switchPanel('Peça');
  await expect(piece).toHaveValue(original.sections[0].content);

  await switchPanel('Conversa');
  await message.fill('Revisar a coerência dos valores na peça aberta.');
  const { completed: review, payload } = await send();
  expect(review).toMatchObject({ conversationId: creation.conversationId, matterId });
  expect(review.contextRevision).toBeGreaterThan(creation.contextRevision);
  expect(payload.useGuidance).toBe(false);
  expect(payload.context.draft).toEqual({ draftId: draft.id, versionId: original.version.id });
  expect(review.deliveryIds.length).toBeGreaterThan(0);
  expect((await readPublic(draftPath)).currentVersion).toEqual(original);
  expect(await readPublic(`/agentic/executions/${creation.id}`)).toMatchObject({
    status: 'COMPLETED',
    contextRevision: creation.contextRevision,
    deliveryIds: creation.deliveryIds,
  });

  await switchPanel('Peça');
  await piece.press('Control+Home');
  for (let i = 0; i < 4; i++) await piece.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Usar trecho na conversa' }).click();
  await switchPanel('Conversa');
  await expect(page.getByText('Trecho para editar · Três')).toBeVisible();
  await message.fill('Corrigir apenas o trecho selecionado.');
  const { completed: edit, payload: editPayload } = await send();
  expect(edit).toMatchObject({ conversationId: creation.conversationId, matterId });
  expect(editPayload.context.deskEdit).toMatchObject({
    versionId: original.version.id,
    start: 0,
    end: 4,
    before: 'Três',
  });
  const { currentVersion: revised } = await readPublic(draftPath);
  const revisedText = `revisto${original.sections[0].content.slice(4)}`;
  expect(revised.version.id).not.toBe(original.version.id);
  expect(
    revised.sections.map(({ title, content }: { title: string; content: string }) => ({ title, content })),
  ).toEqual([{ title: original.sections[0].title, content: revisedText }]);
  await switchPanel('Peça');
  await expect(piece).toHaveValue(revisedText);

  const operationId = randomUUID();
  const query = mobile ? 'vazamento' : 'civil';
  const search = await page.request.post(`${api}/v2/research/search-case-law`, {
    headers: { ...headers, 'Idempotency-Key': operationId },
    data: { query, court: 'STJ', limit: 3 },
  });
  expect(search.ok()).toBe(true);
  const saved = await page.request.post(`${api}/v2/research/saved`, { headers, data: { operationId } });
  expect(saved.ok()).toBe(true);
  const { id: savedId } = await saved.json();
  const { results } = await readPublic(`/v2/research/saved/${savedId}`);
  expect(results.items.length).toBeGreaterThan(0);

  const localText = `${revisedText}\nEdição local R13.`;
  await piece.fill(localText);
  const location = page.url();
  const searches: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/research/search-case-law'))
      searches.push(request.url());
  });
  await page.getByRole('button', { name: 'Pesquisa e fontes', exact: true }).click();
  const research = page.getByRole('dialog', { name: 'Pesquisa e fontes' });
  const item = research.getByRole('listitem').filter({ has: page.getByRole('heading', { name: query, exact: true }) });
  await item.getByRole('button', { name: 'Abrir', exact: true }).click();
  const reader = research.getByRole('region', { name: 'Leitor de decisões' });
  await reader.getByRole('button', { name: 'Salvar no caso' }).click();
  const link = page.getByRole('dialog', { name: 'Salvar julgado no caso' });
  await link.getByLabel('Caso de destino').selectOption(matterId);
  await link.getByRole('button', { name: 'Salvar julgado', exact: true }).click();
  await expect(link.getByRole('status')).toHaveText('Julgado salvo no caso.');
  await link.getByRole('button', { name: 'Fechar', exact: true }).click();
  await research.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Fontes do caso', exact: true }).click();
  const sources = page.getByRole('dialog', { name: 'Fontes do caso' });
  await expect(sources.getByText(results.items[0].processNumber, { exact: true })).toBeVisible();
  await sources.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(searches).toHaveLength(0);
  expect((await readPublic(`/v2/matters/${matterId}/authorities`)).items[0].authority).toEqual(results.items[0]);
  expect(page.url()).toBe(location);
  await expect(piece).toHaveValue(localText);
  expect((await readPublic(draftPath)).currentVersion.version.id).toBe(revised.version.id);
}

test('conclui criação guiada, revisão, edição, pesquisa e fontes no desktop', async ({ page }) => {
  await exerciseDesk(page, false);
});

test('conclui criação guiada, revisão, edição, pesquisa e fontes no celular', async ({ page }) => {
  await exerciseDesk(page, true);
});
