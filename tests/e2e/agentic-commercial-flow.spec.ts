import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDatabase } from '../../packages/persistence/src/db';

test('menu de opções fica dentro da mensagem, preserva o pedido e não inicia cobrança', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('comercial@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  const message = page.getByRole('group', { name: 'Mensagem', exact: true });
  const menu = message.getByRole('combobox', { name: 'Opção do pedido' });
  const input = message.getByRole('textbox', { name: 'O que você precisa fazer?', exact: true });
  await expect(menu).toHaveValue('');
  await expect(page.getByRole('group', { name: 'Sugestões para começar' })).toHaveCount(0);
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/agentic/')) posts.push(request.url());
  });
  await input.fill('Prepare uma manifestação com base nos documentos selecionados.');
  for (const label of ['Analisar documentos', 'Pesquisar uma questão', 'Criar uma peça', 'Revisar um texto']) {
    await menu.selectOption({ label });
    await expect(menu.locator('option:checked')).toHaveText(label);
    await expect(input).toHaveValue('Prepare uma manifestação com base nos documentos selecionados.');
  }
  await menu.selectOption('');
  await expect(menu).toHaveValue('');
  await menu.focus();
  await menu.press('ArrowDown');
  await expect(menu).toHaveValue('analyze_documents');
  await menu.selectOption('create_document');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'tmp/forgelex-mesa-menu-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu).toBeVisible();
  await expect(message.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-label="Novo pedido"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'tmp/forgelex-mesa-menu-mobile.png' });
  expect(posts).toEqual([]);
});

test('entrega análise na mesa sem etapas ou metadados e libera reserva sem documento', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('comercial@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  await page.getByRole('combobox', { name: 'Opção do pedido' }).selectOption('analyze_evidence');
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('PROBATORIA: organizar fatos do relato sintético.');
  await page.getByRole('button', { name: /^Sem caso/ }).click();
  await page.getByLabel('Contexto escrito').fill('Relato sintético sobre serviço não entregue.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const result = page.getByRole('article', { name: 'Resultado do trabalho' });
  await expect(result).toBeVisible({ timeout: 60000 });
  await expect(result.getByText('Análise de fatos e provas', { exact: true })).toBeVisible();
  await expect(result.getByText('O relato ainda não tem apoio documental.', { exact: true })).toBeVisible();
  expect(await result.innerText()).not.toMatch(
    /matriz|cobertura|checkpoint|hash|orquestração|revisão para incorporar/i,
  );
  const id = new URL(page.url()).searchParams.get('executionId');
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const receipt = await (
    await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`, { headers })
  ).json();
  expect(receipt).toMatchObject({ status: 'COMPLETED', chargedCents: 0, releasedCents: 500 });
  await page.reload();
  await expect(result.getByText('Análise de fatos e provas', { exact: true })).toBeVisible();
});

test('percorre cobrança comercial real com transporte sintético e preserva idempotência', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('comercial@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Organizar o relato sintético para conferência.');
  await page.getByRole('button', { name: /^Sem caso/ }).click();
  await page
    .getByLabel('Contexto escrito')
    .fill('Relato sintético: a parte informa que contratou um serviço, mas o serviço não foi entregue.');
  await expect(page.getByText(/Custo de .* por trabalho/)).toBeVisible();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/Este trabalho custa até/)).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible({ timeout: 60000 });
  const receipt = page.getByText('Custo deste trabalho', { exact: true }).locator('..');
  await page.getByText('Custo deste trabalho', { exact: true }).click();
  await expect(receipt).toContainText('0,50');
  await expect(receipt).toContainText('4,50');
  const id = new URL(page.url()).searchParams.get('executionId');
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const before = await (
    await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`, { headers })
  ).json();
  expect(before).toMatchObject({
    status: 'COMPLETED',
    currency: 'BRL',
    reservedCents: 500,
    chargedCents: 50,
    releasedCents: 450,
  });
  const quote = await (
    await page.request.get('http://127.0.0.1:3301/api/agentic/commercial/quote', { headers })
  ).json();
  expect(quote.availableCents).toBe(950);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
  const after = await (
    await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`, { headers })
  ).json();
  expect(after).toMatchObject({ chargedCents: 50, releasedCents: 450 });
  const other = await page.request.get(`http://127.0.0.1:3301/api/agentic/commercial/executions/${id}/receipt`);
  expect(other.status()).toBe(401);
});

test('incorpora somente seleção revisada, recupera resposta perdida e mantém cobrança', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('comercial@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const api = 'http://127.0.0.1:3301',
    headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const matterResponse = await page.request.post(`${api}/api/v2/matters`, {
    headers,
    data: { title: 'Revisão probatória sintética' },
  });
  expect(matterResponse.ok()).toBe(true);
  const matter = await matterResponse.json();
  const documentResponse = await page.request.post(`${api}/api/v2/matters/${matter.id}/documents`, {
    headers,
    data: {
      title: 'Relato para conferência',
      originalFilename: 'relato.txt',
      mimeType: 'text/plain',
      content: 'A parte relata que o serviço não foi entregue.',
    },
  });
  expect(documentResponse.ok()).toBe(true);
  await page.goto('/app/trabalho');
  await page.getByRole('combobox', { name: 'Opção do pedido' }).selectOption('analyze_evidence');
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('PROBATORIA: conferir relato e documento sintéticos.');
  await page.getByRole('button', { name: /^Sem caso/ }).click();
  await page.getByLabel('Contexto escrito').fill('Relato sintético a revisar.');
  await page.getByLabel('Caso (opcional)').selectOption(matter.id);
  await page.getByLabel('Relato para conferência', { exact: true }).check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const result = page.getByRole('article', { name: 'Resultado do trabalho' });
  await expect(result).toBeVisible({ timeout: 60000 });
  const executionId = new URL(page.url()).searchParams.get('executionId');
  const receipt = await (
    await page.request.get(`${api}/api/agentic/commercial/executions/${executionId}/receipt`, { headers })
  ).json();
  const deliveryId = await result.getAttribute('data-delivery-id');
  const deliveryPath = `${api}/api/agentic/deliveries/${encodeURIComponent(deliveryId!)}`;
  const original = await (await page.request.get(deliveryPath, { headers })).json();
  const panel = page.getByRole('dialog', { name: 'Guardar no caso' });
  await expect(panel).not.toBeVisible();
  await expect(result.getByRole('textbox')).toHaveCount(0);
  expect(await result.innerText()).not.toMatch(/matriz|cobertura|token|revision|hash|etapa|orquestração/i);
  await page.screenshot({ path: info.outputPath('mesa-resultado.png'), fullPage: true });
  await result.getByRole('button', { name: 'Guardar no caso', exact: true }).click();
  await expect(panel.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Aprovar e guardar/ })).toBeDisabled();
  await panel.getByLabel('Selecionar item 2', { exact: true }).check();
  await panel.getByRole('button', { name: /Aprovar e guardar/ }).click();
  await expect(panel.getByRole('alert')).toContainText('Selecione também o fato');
  await expect(panel.getByLabel('Selecionar item 1', { exact: true })).not.toBeChecked();
  await panel.getByText('Editar texto', { exact: true }).first().click();
  await panel.getByLabel('Texto do item 1', { exact: true }).fill('Alegação conferida e editada por Boni.');
  await panel.getByLabel('Selecionar item 1', { exact: true }).check();
  const posted: string[] = [];
  await page.route('**/evidence-review/decisions', async (route) => {
    posted.push(route.request().postData()!);
    const response = await route.fetch();
    if (posted.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await panel.getByRole('button', { name: /Aprovar e guardar/ }).click();
  await expect(panel.getByRole('alert')).toContainText('Não foi possível confirmar');
  await expect(panel.getByLabel('Texto do item 1', { exact: true })).toHaveValue(
    'Alegação conferida e editada por Boni.',
  );
  await panel.getByRole('button', { name: 'Verificar decisão' }).click();
  await expect(panel).not.toBeVisible();
  await expect(result.getByRole('status')).toContainText('Itens aprovados e guardados no caso.');
  await expect(result).not.toContainText('nenhum fato foi incorporado');
  expect(posted).toHaveLength(2);
  expect(posted[1]).toBe(posted[0]);
  await result.getByRole('button', { name: 'Guardar no caso', exact: true }).click();
  await panel.getByLabel('Selecionar item 3', { exact: true }).check();
  await panel.getByRole('button', { name: 'Descartar selecionados', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(result.getByRole('status')).toContainText('Itens descartados.');
  await result.getByRole('button', { name: 'Guardar no caso', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 850 });
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('revisao-probatoria.png'), fullPage: true });
  await page.reload();
  await expect(panel).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('mesa-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar no caso', exact: true }).click();
  await expect(panel.getByText(/Guardado no caso.*Alegação conferida/)).toBeVisible();
  const review = await (await page.request.get(`${deliveryPath}/evidence-review`, { headers })).json();
  expect(Object.keys(review.decisions)).toHaveLength(3);
  expect(review.items).toHaveLength(4);
  expect(await (await page.request.get(deliveryPath, { headers })).json()).toEqual(original);
  expect(
    await (
      await page.request.get(`${api}/api/agentic/commercial/executions/${executionId}/receipt`, { headers })
    ).json(),
  ).toEqual(receipt);
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Redigir peça com os fatos aprovados do caso.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const draftResult = page.getByRole('article', { name: 'Resultado do trabalho' }).last();
  await expect(draftResult.getByRole('link', { name: 'Editar minuta' })).toBeVisible({ timeout: 60000 });
  await expect(draftResult).toContainText('Alegação conferida e editada por Boni.');
  const drafted = await (
    await page.request.get(
      `${api}/api/agentic/deliveries/${encodeURIComponent((await draftResult.getAttribute('data-delivery-id'))!)}`,
      { headers },
    )
  ).json();
  expect(drafted.delivery.sources.filter((s: any) => s.approvedItem)).toHaveLength(2);
  expect(drafted.delivery.document.sections.find((s: any) => s.title === 'Fatos').sourceIds).toEqual(
    drafted.delivery.sources.filter((s: any) => s.approvedItem).map((s: any) => s.id),
  );
  expect(await draftResult.innerText()).not.toMatch(/hash|snapshot|checkpoint|orquestração|Selecionar fato/i);
  await page.screenshot({ path: info.outputPath('mesa-peca-com-fatos-aprovados.png'), fullPage: true });
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Revisar o texto com os fatos aprovados do caso.');
  await page.getByRole('button', { name: /^Caso:/ }).click();
  await page.getByLabel('Minuta do caso (opcional)').selectOption(`${drafted.draftId}:${drafted.versionId}`);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const revised = page.getByRole('article', { name: 'Resultado do trabalho' }).last();
  await expect(revised.getByRole('heading', { name: 'Revisão do texto', exact: true })).toBeVisible({ timeout: 60000 });
  await expect(revised).toContainText('Alegação conferida e editada por Boni.');
  const revision = await (
    await page.request.get(
      `${api}/api/agentic/deliveries/${encodeURIComponent((await revised.getAttribute('data-delivery-id'))!)}`,
      { headers },
    )
  ).json();
  expect(revision.delivery.sources.filter((s: any) => s.approvedItem)).toHaveLength(2);
  expect(revision.delivery.sources.some((s: any) => s.kind === 'DRAFT')).toBe(true);
  expect(revision.draftId).toBeUndefined();
  expect(revision.delivery.humanReviewRequired).toBe(true);
  expect(
    await (
      await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(drafted.id)}`, { headers })
    ).json(),
  ).toEqual(drafted);
  // Change only this disposable local fixture; no production editing endpoint is added for testing.
  const databaseUrl = process.env.FORGELEX_COMMERCIAL_TEST_DATABASE_URL!;
  expect(databaseUrl).toMatch(/^file:.*forgelex-commercial-e2e-/);
  const fixture = await createDatabase({ url: databaseUrl });
  try {
    await fixture.client.execute({
      sql: 'UPDATE facts SET statement=? WHERE matter_id=?',
      args: ['Alegação corrigida e aprovada novamente.', matter.id],
    });
    await fixture.client.execute({
      sql: 'UPDATE evidence_items SET title=? WHERE matter_id=?',
      args: ['Prova corrigida para conferência.', matter.id],
    });
  } finally {
    fixture.client.close();
  }
  const revisionsPath = `${api}/api/agentic/matters/${matter.id}/evidence-changes`;
  const revisedExecutionId = new URL(page.url()).searchParams.get('executionId');
  const costBefore = await (
    await page.request.get(`${api}/api/agentic/commercial/executions/${revisedExecutionId}/receipt`, { headers })
  ).json();
  await page.getByRole('button', { name: 'Revisar alterações', exact: true }).click();
  const changes = page.getByRole('dialog', { name: 'Revisar alterações', exact: true });
  await expect(changes.getByText('Alegação corrigida e aprovada novamente.', { exact: true }).first()).toBeVisible();
  await expect(changes.getByText('Alegação conferida e editada por Boni.', { exact: true }).first()).toBeVisible();
  await expect(changes.getByRole('button', { name: 'Aprovar alterações', exact: true })).toBeDisabled();
  await changes.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect((await (await page.request.get(revisionsPath, { headers })).json()).items).toHaveLength(2);
  await page.getByRole('button', { name: 'Revisar alterações', exact: true }).click();
  await changes.getByRole('checkbox').first().check();
  await changes.getByRole('checkbox').last().check();
  await page.route('**/evidence-changes/decisions', async (route) => route.abort('failed'), { times: 1 });
  await changes.getByRole('button', { name: 'Aprovar alterações', exact: true }).click();
  await expect(changes.getByRole('alert')).toContainText('Não foi possível confirmar');
  const changedDuringReview = await createDatabase({ url: databaseUrl });
  try {
    await changedDuringReview.client.execute({
      sql: "UPDATE facts SET status=CASE WHEN status='ASSERTED' THEN 'DISPUTED' ELSE 'ASSERTED' END WHERE matter_id=?",
      args: [matter.id],
    });
  } finally {
    changedDuringReview.client.close();
  }
  const rejectedRetry = page.waitForResponse(
    (response) => response.url().endsWith('/evidence-changes/decisions') && response.request().method() === 'POST',
  );
  await changes.getByRole('button', { name: 'Verificar decisão', exact: true }).click();
  const rejectedResponse = await rejectedRetry;
  expect(rejectedResponse.status()).toBe(409);
  expect((await rejectedResponse.json()).error).toBe('EVIDENCE_REVIEW_CONFLICT');
  await expect(changes.getByRole('button', { name: 'Atualizar itens', exact: true })).toBeVisible();
  await changes.getByRole('button', { name: 'Atualizar itens', exact: true }).click();
  await expect(changes.getByRole('button', { name: 'Atualizar itens', exact: true })).toBeEnabled();
  await expect(changes.getByRole('checkbox').first()).not.toBeChecked();
  await expect(changes.getByRole('checkbox').last()).not.toBeChecked();
  await expect(changes.getByRole('button', { name: 'Aprovar alterações', exact: true })).toBeDisabled();
  await changes.getByRole('checkbox').first().check();
  await changes.getByRole('checkbox').last().check();
  await expect(changes.getByRole('button', { name: 'Aprovar alterações', exact: true })).toBeEnabled();
  const changePosts: string[] = [];
  await page.route('**/evidence-changes/decisions', async (route) => {
    changePosts.push(route.request().postData()!);
    const response = await route.fetch();
    if (changePosts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 375, height: 850 });
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await changes.innerText()).not.toMatch(/hash|snapshot|checkpoint|orquestração|revision|tenant/i);
  await changes.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath('revisar-alteracoes-mobile.png') });
  await changes.getByRole('button', { name: 'Aprovar alterações', exact: true }).click();
  await expect(changes.getByRole('alert')).toContainText('Não foi possível confirmar');
  await changes.getByRole('button', { name: 'Verificar decisão', exact: true }).click();
  await expect(changes).not.toBeVisible();
  expect(changePosts).toHaveLength(2);
  expect(changePosts[0]).toBe(changePosts[1]);
  expect((await (await page.request.get(revisionsPath, { headers })).json()).items).toEqual([]);
  expect(
    await (
      await page.request.get(`${api}/api/agentic/commercial/executions/${revisedExecutionId}/receipt`, { headers })
    ).json(),
  ).toEqual(costBefore);
  expect(
    await (
      await page.request.get(`${api}/api/agentic/deliveries/${encodeURIComponent(drafted.id)}`, { headers })
    ).json(),
  ).toEqual(drafted);
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByLabel('O que você precisa fazer?', { exact: true })
    .fill('Redigir peça com os fatos aprovados novamente.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar trabalho', exact: true }).click();
  const freshResult = page.getByRole('article', { name: 'Resultado do trabalho' }).last();
  await expect(freshResult.getByRole('link', { name: 'Editar minuta' })).toBeVisible({ timeout: 60000 });
  await expect(freshResult).toContainText('Alegação corrigida e aprovada novamente.');
  await page.screenshot({ path: info.outputPath('mesa-apos-nova-aprovacao.png'), fullPage: true });
  await page.goto(`/app/casos?caso=${encodeURIComponent(matter.id)}`);
  await expect(page.getByText('Alegação corrigida e aprovada novamente.', { exact: true }).first()).toBeVisible();
});
