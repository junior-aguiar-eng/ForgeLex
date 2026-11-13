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

for (const width of [1440, 390]) {
  test(`corrige tribunal e peça confirmada pelos controles do resumo em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 });
    await openDesk(page);
    await page
      .getByRole('textbox', { name: 'O que você precisa fazer?' })
      .fill('Preciso elaborar resposta à acusação.');
    await page.getByRole('button', { name: 'Me ajude a começar' }).click();
    await question(page).getByRole('radio', { name: 'Penal', exact: true }).check();
    await next(page);
    await question(page).getByRole('radio', { name: 'Elaborar uma peça', exact: true }).check();
    await next(page);
    await question(page).getByRole('radio', { name: 'Sim, é essa', exact: true }).check();
    await next(page);
    await question(page).getByRole('textbox', { name: 'Sua resposta' }).fill('TJ-AL');
    await next(page);
    await expect(question(page)).toHaveCount(0);
    const conversationId = new URL(page.url()).searchParams.get('conversationId');
    await summary(page).getByRole('button', { name: 'Alterar', exact: true }).click();
    await summary(page).getByRole('button', { name: 'Alterar tribunal', exact: true }).click();
    await question(page).getByRole('textbox', { name: 'Sua resposta' }).fill('TJ-SP');
    const correction = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/correct'),
    );
    await next(page);
    const corrected = await correction;
    expect(corrected.ok()).toBe(true);
    expect(corrected.request().postDataJSON()).toMatchObject({ selectedOptionIds: [], freeText: 'TJ-SP' });
    await expect(summary(page)).toContainText('TJ-SP');
    await expect(summary(page)).toContainText('Resposta à acusação');
    await page.reload();
    await expect(summary(page)).toContainText('TJ-SP');
    expect(new URL(page.url()).searchParams.get('conversationId')).toBe(conversationId);
    await summary(page).getByRole('button', { name: 'Alterar', exact: true }).click();
    await summary(page).getByRole('button', { name: 'Alterar peça', exact: true }).click();
    await question(page).getByRole('radio', { name: 'Não, é outra', exact: true }).check();
    await next(page);
    await expect(question(page).locator('legend')).toContainText('Explique em poucas palavras');
    await expect(summary(page)).not.toContainText('Resposta à acusação');
    await page.reload();
    await expect(question(page).locator('legend')).toContainText('Explique em poucas palavras');
    await expect(summary(page)).toContainText('TJ-SP');
    expect(new URL(page.url()).searchParams.get('conversationId')).toBe(conversationId);
  });
}

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

test('voltar um passo reabre a resposta anterior e não perde o que já foi escolhido ou digitado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await openDesk(page);
  await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill('resposta à acusação');
  await page.getByRole('button', { name: 'Me ajude a começar' }).click();
  // Na primeira pergunta não há para onde voltar.
  await expect(question(page).getByRole('button', { name: 'Voltar', exact: true })).toHaveCount(0);
  await question(page).getByRole('radio', { name: 'Penal', exact: true }).check();
  await next(page);
  await expect(question(page).locator('legend')).toHaveText('O que você precisa fazer?');
  await question(page).getByRole('radio', { name: 'Analisar documentos', exact: true }).check();
  await question(page).getByRole('button', { name: 'Voltar', exact: true }).click();

  // A resposta anterior reabre com a opção escolhida.
  await expect(question(page).locator('legend')).toHaveText('Em qual área você precisa trabalhar?');
  await expect(question(page).getByRole('radio', { name: 'Penal', exact: true })).toBeChecked();
  await page.screenshot({ path: 'test-results/desk-guidance-v3/05-voltar.png', animations: 'disabled' });
  await question(page).getByRole('button', { name: 'Cancelar alteração' }).click();

  // De volta à pergunta pendente, a escolha ainda não enviada continua marcada.
  await expect(question(page).locator('legend')).toHaveText('O que você precisa fazer?');
  await expect(question(page).getByRole('radio', { name: 'Analisar documentos', exact: true })).toBeChecked();
});

test('matérias do pedido: a Mesa sugere uma por vez, o cliente confirma, remove, e a dica segue no contexto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await openDesk(page);
  const group = page.getByRole('region', { name: 'Matérias do pedido' });
  await group.getByRole('button', { name: 'Adicionar matéria' }).click();
  await group.getByLabel(/Qual matéria você quer incluir/).fill('o réu alega prescrição intercorrente');
  await group.getByRole('button', { name: 'Sugerir matéria' }).click();
  const proposal = group.getByRole('group', { name: 'Matéria sugerida' });
  await expect(proposal).toContainText('Prescrição intercorrente');
  await page.screenshot({ path: 'test-results/desk-guidance-v3/06-materia-sugerida.png', animations: 'disabled' });

  // Recusar: sem outra parecida, a Mesa pede para descrever de outro jeito (e nunca mostra lista).
  await proposal.getByRole('button', { name: 'Não, outra' }).click();
  await expect(group.getByText(/Não há outra matéria parecida/)).toBeVisible();
  await group.getByLabel(/Qual matéria você quer incluir/).fill('prova ilícita');
  await group.getByRole('button', { name: 'Sugerir matéria' }).click();
  await expect(group.getByRole('group', { name: 'Matéria sugerida' })).toContainText('Prova ilícita');
  await group.getByRole('button', { name: 'Sim, adicionar' }).click();
  await expect(group.getByRole('list', { name: 'Matérias do pedido' })).toContainText('Prova ilícita');

  // Remover e adicionar de novo.
  await group.getByRole('button', { name: 'Remover matéria: Prova ilícita' }).click();
  await expect(group.getByRole('list', { name: 'Matérias do pedido' })).toHaveCount(0);
  await group.getByRole('button', { name: 'Adicionar matéria' }).click();
  await group.getByLabel(/Qual matéria você quer incluir/).fill('prova ilícita');
  await group.getByRole('button', { name: 'Sugerir matéria' }).click();
  await group.getByRole('button', { name: 'Sim, adicionar' }).click();

  const message = 'Elaborar a defesa considerando as matérias indicadas.';
  await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill(message);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.objective).toBe(message);
  expect(sent.context.text).toContain(message);
  expect(sent.context.text).toContain(
    'Matérias indicadas pelo cliente (confira se se aplicam ao caso): Prova ilícita.',
  );
  expect(JSON.stringify(sent)).not.toContain('prova-ilicita');
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
});
