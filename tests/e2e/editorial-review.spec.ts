import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}
async function ask(page: Page, message: string) {
  const before = new URL(page.url()).searchParams.get('executionId');
  const input = page.getByLabel('O que você precisa fazer?', { exact: true });
  await expect(input).toHaveCount(1);
  await input.fill(message);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('executionId')).not.toBe(before);
  const id = new URL(page.url()).searchParams.get('executionId');
  let run: any;
  await expect
    .poll(
      async () => {
        run = await (await page.request.get(`${api}/api/agentic/executions/${id}`, { headers })).json();
        return run.status;
      },
      { timeout: 30000 },
    )
    .toBe('COMPLETED');
  await expect(input).toBeVisible();
  return run;
}
async function delivery(page: Page, run: any) {
  return (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(run.deliveryIds[0])}`, { headers })
  ).json();
}
test('um chat cria, revisa sem alterar e muda a mesma peça ao lado', async ({ page }) => {
  await login(page);
  let editorialCalls = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/agentic/') && path.includes('/editorial-')) editorialCalls++;
  });
  const matter = await (
    await page.request.post(`${api}/api/v2/matters`, { headers, data: { title: 'Caso do chat único' } })
  ).json();
  await page.getByRole('button', { name: /^Vincular a um caso/ }).click();
  await page.getByLabel('Caso', { exact: true }).selectOption(matter.id);
  await page.getByRole('button', { name: /^Caso:/ }).click();
  const first = await ask(page, 'Redigir um relato sintético FLUXO_MESA com três parcelas e total');
  const original = await delivery(page, first);
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  const text = desk.getByLabel('Texto da seção 1', { exact: true });
  await expect(text).toHaveValue(/200,00/);
  await expect(page.getByRole('button', { name: /Revisar peça|Revisar na mesa|Pedir ajuste/ })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const review = await ask(page, 'Revisar a peça aberta, incluindo a soma, sem alterar o texto');
  expect(review.conversationId).toBe(first.conversationId);
  const reviewed = await delivery(page, review);
  expect(reviewed.delivery.document).toBeUndefined();
  expect(reviewed.delivery.findings.some((f: any) => f.code === 'EDITORIAL_ARITHMETIC_MISMATCH')).toBe(true);
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toContainText('300,00');
  await expect(text).toHaveValue(/200,00/);
  const before = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${original.draftId}`, { headers })
  ).json();
  expect(before.currentVersion.version.id).toBe(original.versionId);
  const edited = await ask(page, 'Corrigir o total para R$ 300,00 na peça aberta');
  expect(edited.conversationId).toBe(first.conversationId);
  const updated = await delivery(page, edited);
  expect(updated.draftId).toBe(original.draftId);
  expect(updated.versionId).not.toBe(original.versionId);
  await expect(text).toHaveValue(/300,00/);
  await expect(
    page.getByRole('article', { name: 'Resposta anterior' }).filter({ hasText: 'possível divergência' }),
  ).toBeVisible();
  const list = await (await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts`, { headers })).json();
  expect(list.items).toHaveLength(1);
  const after = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${original.draftId}`, { headers })
  ).json();
  expect(after.versions).toHaveLength(2);
  expect(editorialCalls).toBe(0);
  const issues = await new AxeBuilder({ page }).include('[data-writing-desk]').analyze();
  expect(issues.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: 'test-results/writing-desk/single-chat-desktop.png', fullPage: true });
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Resposta anterior' }).filter({ hasText: 'possível divergência' }),
  ).toBeVisible();
  await expect(text).toHaveValue(/300,00/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Conversa', exact: true }).click();
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/writing-desk/single-chat-mobile.png', fullPage: true });
});
test('enviar revisão guarda a edição manual e usa essa versão sem etapa adicional', async ({ page }) => {
  await login(page);
  const matter = await (
    await page.request.post(`${api}/api/v2/matters`, { headers, data: { title: 'Peça manual' } })
  ).json();
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await desk.getByLabel('Título da peça').fill('Texto manual');
  await desk
    .getByLabel('Texto da seção 1', { exact: true })
    .fill('Três parcelas de R$ 100,00 cada. O total é R$ 200,00.');
  await desk.getByText('Abrir peça', { exact: true }).click();
  let releaseContext!: () => void;
  const pendingContext = new Promise<void>((resolve) => {
    releaseContext = resolve;
  });
  await page.route(`**/api/v2/matters/${matter.id}/drafts`, async (route) => {
    await pendingContext;
    await route.continue();
  });
  const draftsRequested = page.waitForRequest(`**/api/v2/matters/${matter.id}/drafts`);
  try {
    await desk.getByLabel('Caso da peça').selectOption(matter.id);
    await draftsRequested;
    await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Revisar o texto aberto sem alterar');
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
    await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(/200,00/);
  } finally {
    releaseContext();
  }
  const run = await ask(page, 'Revisar o texto aberto sem alterar');
  expect(run.matterId).toBe(matter.id);
  expect(run.context.draft?.versionId).toBeTruthy();
  const result = await delivery(page, run);
  expect(result.delivery.findings.some((f: any) => f.code === 'EDITORIAL_ARITHMETIC_MISMATCH')).toBe(true);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(/200,00/);
});

test('peça local também é revisada e alterada pelo mesmo chat sem escolher caso', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await desk.getByLabel('Título da peça').fill('Peça local');
  await desk
    .getByLabel('Texto da seção 1', { exact: true })
    .fill('Três parcelas de R$ 100,00 cada. O total é R$ 200,00.');
  const review = await ask(page, 'Revisar o texto aberto sem alterar');
  expect(review.matterId).toBeNull();
  const result = await delivery(page, review);
  expect(result.delivery.findings.some((f: any) => f.code === 'EDITORIAL_ARITHMETIC_MISMATCH')).toBe(true);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(/200,00/);
  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  const edit = await ask(page, 'Corrigir o total para R$ 300,00');
  expect(edit.conversationId).toBe(review.conversationId);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(/300,00/);
  expect(dialogs).toBe(0);
});
