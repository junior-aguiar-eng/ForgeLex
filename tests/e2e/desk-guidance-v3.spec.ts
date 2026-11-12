import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openDesk(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

const question = (page: Page) => page.getByRole('region', { name: 'Pergunta do pedido' });
const summary = (page: Page) => page.getByRole('region', { name: 'Resumo do pedido' });
const next = (page: Page) =>
  question(page)
    .getByRole('button', { name: /^(Continuar|Salvar alteração)$/ })
    .click();

test('do texto livre à peça confirmada e ao tribunal, com busca nas 25 áreas e só a peça em uso à vista', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await openDesk(page);
  const objective = 'Preciso elaborar a resposta à acusação do meu cliente.';
  await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill(objective);
  await page.getByRole('button', { name: 'Me ajude a começar' }).click();

  // Primeira pergunta: as grandes áreas como atalho, com busca.
  await expect(question(page).locator('legend')).toHaveText('Em qual área você precisa trabalhar?');
  await expect(question(page).getByRole('radio')).toHaveCount(27); // 25 áreas, "Outra área" e "Não sei"
  const search = question(page).getByRole('searchbox', { name: 'Buscar nas opções' });
  await search.fill('processo');
  await expect(question(page).getByRole('radio', { name: 'Processo penal', exact: true })).toBeVisible();
  await expect(question(page).getByRole('radio', { name: 'Tributário', exact: true })).toHaveCount(0);
  await search.fill('penal');
  await question(page).getByRole('radio', { name: 'Penal', exact: true }).check();
  await page.screenshot({ path: 'test-results/desk-guidance-v3/01-areas.png', animations: 'disabled' });
  await next(page);
  await expect(summary(page)).toContainText('Penal');

  await question(page).getByRole('radio', { name: 'Elaborar uma peça', exact: true }).check();
  await next(page);

  // A Mesa propõe uma peça por vez, pelo texto do pedido, sem mostrar lista.
  await expect(question(page).locator('legend')).toHaveText(
    'Pelo que você informou, a peça é: Resposta à acusação. Está correto?',
  );
  await expect(question(page).getByRole('radio')).toHaveCount(3); // Sim, Não e Não sei
  await expect(summary(page)).not.toContainText('Resposta à acusação'); // só proposta: ainda não está em uso
  await page.screenshot({ path: 'test-results/desk-guidance-v3/02-hipotese.png', animations: 'disabled' });
  await question(page).getByRole('radio', { name: 'Sim, é essa', exact: true }).check();
  await next(page);
  await expect(summary(page)).toContainText('Resposta à acusação');
  await expect(summary(page)).not.toContainText('a confirmar');

  // Tribunal em texto livre.
  await expect(question(page).locator('legend')).toContainText('Em qual tribunal');
  await question(page).getByRole('textbox', { name: 'Sua resposta' }).fill('TJ-AL');
  await next(page);
  await expect(question(page)).toHaveCount(0);
  await expect(summary(page)).toContainText('Penal · ');
  await expect(summary(page)).toContainText('TJ-AL');

  const main = page.locator('[data-writing-desk]');
  await expect(main).not.toContainText(/contestacao-civel|Contestação cível|defesa preliminar|guidanceHash/);
  await page.screenshot({ path: 'test-results/desk-guidance-v3/03-resumo.png', animations: 'disabled' });
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
});

test('recusar a peça proposta segue para outra candidata ou para o pedido livre, no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDesk(page);
  await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill('resposta à acusação');
  await page.getByRole('button', { name: 'Me ajude a começar' }).click();
  await question(page).getByRole('searchbox', { name: 'Buscar nas opções' }).fill('penal');
  await question(page).getByRole('radio', { name: 'Penal', exact: true }).check();
  await next(page);
  await question(page).getByRole('radio', { name: 'Elaborar uma peça', exact: true }).check();
  await next(page);
  await expect(question(page).locator('legend')).toContainText('a peça é: Resposta à acusação');
  await question(page).getByRole('radio', { name: 'Não, é outra', exact: true }).check();
  await next(page);
  // Sem outra candidata no catálogo, a Mesa pede para explicar e segue como pedido livre.
  await expect(question(page).locator('legend')).toContainText('Explique em poucas palavras');
  await question(page).getByRole('textbox', { name: 'Sua resposta' }).fill('algo que o catálogo não tem');
  await next(page);
  await expect(question(page).locator('legend')).toContainText('Em qual tribunal');
  await page.screenshot({ path: 'test-results/desk-guidance-v3/04-celular-livre.png', animations: 'disabled' });
});
