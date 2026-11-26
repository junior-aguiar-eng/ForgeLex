import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/app(\/trabalho)?$/);
}

const attach = (page: Page) => page.getByLabel('Escolher arquivos para anexar');
const text = (name: string, content: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(content, 'utf8'),
});

// Regra do mínimo (AGENTS.md, 26/11/2026): anexar e pedir, como numa conversa. O texto extraído segue com o pedido; não
// há "Salvar no caso" nem dica para escolher caso.
test('anexo de texto segue com o pedido, sem salvar no caso, e a Mesa segue acessível', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto('/app/trabalho');
  await attach(page).setInputFiles(text('relato.txt', 'A cliente nega o contrato de empréstimo.'));
  await expect(page.getByRole('list', { name: 'Anexos do pedido' }).getByText('relato.txt')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Salvar no caso/ })).toHaveCount(0);
  await expect(page.getByText(/escolha um caso/i)).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations,
  ).toEqual([]);

  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Resuma o relato anexado.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.objective).toBe('Resuma o relato anexado.');
  expect(sent.actionId).toBeUndefined();
  expect(sent.context.text).toContain('A cliente nega o contrato de empréstimo.');
});
