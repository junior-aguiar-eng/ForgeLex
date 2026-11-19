import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:3301';
const apiHeaders = { authorization: 'Bearer phase7-e2e-access-token' };

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}

const attach = (page: Page) => page.getByLabel('Escolher arquivos para anexar');
const text = (name: string, content: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(content, 'utf8'),
});

test('salvar o anexo no caso: sem caso só há a dica; com caso grava um documento uma só vez e refaz depois de trocar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso do anexo' } })
  ).json();
  await login(page);
  await page.goto('/app/trabalho');
  await attach(page).setInputFiles(text('relato.txt', 'Primeira linha do relato.\nSegunda linha do relato.'));
  const chips = page.getByRole('list', { name: 'Anexos do pedido' });
  await expect(chips.getByText('relato.txt')).toBeVisible();

  // Sem caso escolhido: nenhum botão, só a dica de como guardar o texto.
  await expect(page.getByRole('button', { name: /^Salvar no caso/ })).toHaveCount(0);
  await expect(
    page.getByText('Para guardar o texto de um anexo como documento do caso, escolha um caso.'),
  ).toBeVisible();

  // Com o caso escolhido, o botão aparece. Um clique duplo grava um só documento.
  const header = page.locator('[data-writing-desk] > header');
  await header.getByLabel('Caso', { exact: true }).selectOption(matter.id);
  let posts = 0;
  await page.route('**/api/v2/matters/*/documents', async (route) => {
    if (route.request().method() === 'POST') posts += 1;
    await route.continue();
  });
  const save = page.getByRole('button', { name: 'Salvar no caso: relato.txt' });
  await expect(save).toBeVisible();
  await expect(page.getByText('Para guardar o texto de um anexo como documento do caso, escolha um caso.')).toHaveCount(
    0,
  );
  await save.dblclick();
  const saved = chips.getByRole('status').filter({ hasText: 'Salvo no caso' });
  await expect(saved).toContainText('Salvo no caso “Caso do anexo” como “relato” (2 parágrafos)');
  await expect(saved).toContainText('O documento salvo não muda se você editar o texto depois');
  await expect(save).toHaveCount(0);
  expect(posts).toBe(1);
  const detail = await (await page.request.get(`${api}/api/v2/matters/${matter.id}`, { headers: apiHeaders })).json();
  expect(
    detail.documents.map((d: { title: string; originalFilename: string }) => [d.title, d.originalFilename]),
  ).toEqual([['relato', 'relato.txt']]);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Trocar o arquivo apaga o "salvo": o novo texto pode ser salvo como outro documento.
  await page.getByLabel('Escolher o novo arquivo para: relato.txt').setInputFiles(text('outro.txt', 'Texto novo.'));
  await expect(page.getByRole('button', { name: 'Salvar no caso: outro.txt' })).toBeVisible();
  await expect(chips.getByText('Salvo no caso')).toHaveCount(0);
});

test('salvar o anexo no caso: recusa da API aparece em texto, não duplica e a nova tentativa funciona', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers: apiHeaders, data: { title: 'Caso da recusa' } })
  ).json();
  await login(page);
  await page.goto('/app/trabalho');
  await attach(page).setInputFiles(text('longo.txt', 'Linha única.'));
  await page.locator('[data-writing-desk] > header').getByLabel('Caso', { exact: true }).selectOption(matter.id);

  // A API recusa pelo teto de parágrafos: o cliente lê o motivo e nada é gravado.
  await page.route(
    '**/api/v2/matters/*/documents',
    async (route) =>
      route.fulfill({
        status: 413,
        json: { error: 'DOCUMENT_ANCHOR_LIMIT_EXCEEDED', message: 'DOCUMENT_ANCHOR_LIMIT_EXCEEDED: x' },
      }),
    { times: 1 },
  );
  const save = page.getByRole('button', { name: 'Salvar no caso: longo.txt' });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '5.000 linhas' })).toBeVisible();
  const empty = await (await page.request.get(`${api}/api/v2/matters/${matter.id}`, { headers: apiHeaders })).json();
  expect(empty.documents).toHaveLength(0);

  // Nova tentativa depois da recusa grava o documento.
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Salvo no caso “Caso da recusa”' })).toBeVisible();
  const once = await (await page.request.get(`${api}/api/v2/matters/${matter.id}`, { headers: apiHeaders })).json();
  expect(once.documents).toHaveLength(1);
});
