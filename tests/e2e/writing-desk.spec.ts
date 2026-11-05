import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:3301';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

test('edição local, exportação, versão salva e pedido contextual na mesma mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toContainText('Rascunhos');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toContainText('Revisão');
  const response = await page.request.post(api + '/api/v2/matters', {
    headers,
    data: { title: 'Caso da mesa integrada' },
  });
  const matter = await response.json();
  await page.getByRole('button', { name: 'Nova peça', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await desk.getByLabel('Título da peça').fill('Petição de teste local');
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Texto editado localmente, sem chamada à IA.');
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeDisabled();
  await desk.getByLabel('Exportar peça').click();
  const download = page.waitForEvent('download');
  await desk.getByRole('button', { name: /Word/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  await desk.getByLabel('Exportar peça').click();
  const popup = page.waitForEvent('popup');
  await desk.getByRole('button', { name: /PDF/ }).click();
  const print = await popup;
  await expect(print.getByText('Texto editado localmente, sem chamada à IA.')).toBeVisible();
  await expect(print.getByRole('heading', { name: 'Petição de teste local' })).toBeVisible();
  await print.close();
  // Choosing a case must preserve the locally authored text.
  await page.getByRole('button', { name: 'Recolher peça' }).click();
  await expect(desk).not.toBeVisible();
  await page.getByRole('button', { name: 'Abrir peça', exact: true }).click();
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    'Texto editado localmente, sem chamada à IA.',
  );
  await desk.getByText('Abrir peça', { exact: true }).click();
  await desk.getByLabel('Caso da peça').selectOption(matter.id);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue(
    'Texto editado localmente, sem chamada à IA.',
  );
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  const listing = await (await page.request.get(api + '/api/v2/matters/' + matter.id + '/drafts', { headers })).json();
  const draft = { draft: listing.items[0] };
  await desk.getByText('Peça aberta', { exact: true }).click();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Relato sintético alterado na mesa.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  const details = await (
    await page.request.get(`${api}/api/v2/matters/${matter.id}/drafts/${draft.draft.id}`, { headers })
  ).json();
  expect(details.currentVersion.sections[0].content).toBe('Relato sintético alterado na mesa.');
  await desk.getByRole('button', { name: 'Pedir ajuste' }).click();
  await expect(page.getByLabel('O que você precisa fazer?', { exact: true })).toHaveValue(/Na peça aberta/);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Melhore a clareza dos fatos desta peça');
  await page.screenshot({ path: 'test-results/writing-desk/desktop.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page }).include('[data-writing-desk]').analyze();
  expect(accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.matterId).toBe(matter.id);
  expect(sent.context.draft).toEqual({ draftId: draft.draft.id, versionId: details.currentVersion.version.id });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Peça', exact: true }).click();
  await expect(desk).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/writing-desk/mobile.png', fullPage: true });
});

test('entrega abre ao lado, mantém edição ao navegar e aceita links antigos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const matter = await (
    await page.request.post(api + '/api/v2/matters', { headers, data: { title: 'Caso da entrega integrada' } })
  ).json();
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Redigir minuta para revisão editorial');
  await page.getByRole('button', { name: /^(Sem caso|Caso:)/ }).click();
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Contexto escrito').fill('Relato sintético sujeito a conferência.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Mesa da peça' });
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).not.toHaveValue('');
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  const run = await (
    await page.request.get(`${api}/api/agentic/executions/${new URL(page.url()).searchParams.get('executionId')}`, {
      headers,
    })
  ).json();
  const delivery = await (
    await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(run.deliveryIds[0])}`, { headers })
  ).json();
  await desk.getByLabel('Texto da seção 1', { exact: true }).fill('Alteração local preservada.');
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Casos', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Mesa', exact: true })
    .click();
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await desk.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(desk.getByRole('button', { name: 'Pedir ajuste' })).toBeEnabled();
  await page.goto(`/app/rascunhos?matterId=${matter.id}&draftId=${delivery.draftId}`);
  await expect(desk.getByLabel('Texto da seção 1', { exact: true })).toHaveValue('Alteração local preservada.');
  await expect(page).toHaveURL(/\/app\/trabalho/);
  await page.goto('/app/revisao');
  await expect(page.getByRole('dialog', { name: 'Conferências do caso' })).toBeVisible();
});
