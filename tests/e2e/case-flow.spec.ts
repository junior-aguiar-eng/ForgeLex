import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('ciclo documental completo por UI com host MCP sintético e aprovação recuperável', async ({
  page,
  request,
}, info) => {
  const api = process.env.FORGELEX_TEST_API_ORIGIN ?? 'http://127.0.0.1:3301';
  const state = await (await request.get(api + '/e2e/state')).json();
  const host = async (name: string, args: unknown) => {
    const response = await request.post(api + '/mcp', {
      headers: { authorization: 'Bearer ' + state.oauthTokens['app-one'] },
      data: { jsonrpc: '2.0', id: name, method: 'tools/call', params: { name, arguments: args } },
    });
    const result = (await response.json()).result;
    expect(result.isError, JSON.stringify(result)).toBe(false);
    return result.structuredContent;
  };
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('contexto@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.getByRole('button', { name: 'Casos', exact: true }).click();
  const title = 'Ciclo simplificado ' + Date.now();
  await page.getByPlaceholder('Nome do novo caso').fill(title);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/v2/matters') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar caso', exact: true }).click();
  const matter = await (await created).json();
  await page.getByText('Adicionar documento', { exact: true }).click();
  await page.getByPlaceholder('Título do documento').fill('Contrato fictício');
  await page.getByPlaceholder('Nome do arquivo (ex.: fatos.txt)').fill('contrato.txt');
  await page
    .getByRole('textbox', { name: 'Texto do documento' })
    .fill(
      'SIMULAÇÃO. Alfa e Beta contrataram em 15/01/2026.\n\nAlfa alega pagamento em 20/01/2026, sem recibo ou transferência.\n\nBeta nega o recebimento e cobra em 10/02/2026.',
    );
  const ingested = page.waitForResponse((r) => r.url().endsWith('/documents') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ingerir documento textual' }).click();
  const doc = await (await ingested).json();
  await page.getByRole('button', { name: 'Analisar documentos do caso', exact: true }).click();
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  await page.locator('dialog label').filter({ hasText: 'Contrato fictício' }).getByRole('checkbox').check();
  await page.getByLabel('Permitir que esta IA envie análises do caso').check();
  await page.getByLabel('Objetivo da análise').fill('Confrontar pagamento e ausência de comprovante');
  await page.getByLabel('Permitir que esta IA envie textos ao editor').check();
  await page.getByRole('button', { name: 'Autorizar e copiar instrução', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Acesso permitido');
  const context = await host('case.get_context', { matterId: matter.id });
  await host('case.read_item', { matterId: matter.id, kind: 'DOCUMENT', itemId: doc.document.id });
  const sources = [
    {
      documentId: doc.document.id,
      versionId: doc.version.id,
      anchorId: doc.anchors[1].id,
      quote: doc.anchors[1].text,
      relation: 'CONTEXT',
    },
  ];
  const items = [
    { id: 'alfa', kind: 'FACT', text: 'Alfa alega pagamento.', classification: 'ALLEGATION', sources },
    { id: 'beta', kind: 'FACT', text: 'Beta nega recebimento.', classification: 'DISPUTED', sources },
    {
      id: 'contrato',
      kind: 'EVIDENCE',
      text: 'Contrato fictício sem recibo.',
      classification: 'EXTRACTED',
      factItemId: 'alfa',
      relation: 'CONTEXT',
      sources,
    },
    {
      id: 'contratacao',
      kind: 'TIMELINE',
      text: 'Contratação.',
      classification: 'EXTRACTED',
      eventDate: '2026-01-15',
      sources,
    },
    {
      id: 'cobranca',
      kind: 'TIMELINE',
      text: 'Cobrança alegada.',
      classification: 'ALLEGATION',
      eventDate: '2026-02-10',
      sources,
    },
    {
      id: 'questao',
      kind: 'ISSUE',
      text: 'Quais documentos confrontam as alegações?',
      classification: 'LEGAL_QUESTION',
      sources,
    },
    { id: 'lacuna', kind: 'GAP', text: 'Não há comprovante de transferência.', classification: 'GAP', sources },
    {
      id: 'inferencia',
      kind: 'FACT',
      text: 'Pagamento comprovado pela alegação.',
      classification: 'INFERENCE',
      sources,
    },
  ];
  await host('case.save_analysis', {
    matterId: matter.id,
    expectedGrantRevision: context.grantRevision,
    idempotencyKey: 'full-flow-' + matter.id,
    objective: context.analysisReceiving.objective,
    items,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Conferir análise', exact: true }).click();
  const alfa = page.getByRole('article', { name: 'Proposta alfa' });
  await alfa.getByRole('button', { name: 'Editar', exact: true }).click();
  await alfa.getByRole('textbox').fill('Alfa alega pagamento, ainda sem comprovante.');
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'Ir para o texto' }).click();
  await expect(alfa.getByRole('textbox')).toHaveValue('Alfa alega pagamento, ainda sem comprovante.');
  await alfa.getByRole('button', { name: 'Abrir fonte', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('sem recibo');
  await page.getByRole('button', { name: 'Fechar leitura' }).click();
  await expect(alfa.getByRole('textbox')).toHaveValue('Alfa alega pagamento, ainda sem comprovante.');
  await page
    .getByRole('article', { name: 'Proposta inferencia' })
    .getByRole('button', { name: 'Descartar', exact: true })
    .click();
  for (const item of items.slice(0, 7))
    await page
      .getByRole('article', { name: 'Proposta ' + item.id })
      .getByRole('checkbox', { name: 'Selecionar proposta' })
      .check();
  await page.getByRole('button', { name: 'Incorporar selecionados' }).click();
  await expect(page.getByRole('status')).toContainText('Itens incorporados');
  const received = await host('draft.save_from_ai', {
    matterId: matter.id,
    expectedGrantRevision: context.grantRevision,
    idempotencyKey: 'draft-full-flow-' + matter.id,
    title: 'Relatório do ciclo completo',
    sections: [
      { ordinal: 0, title: 'Alegações', content: 'Alfa alega pagamento; Beta nega recebimento.' },
      { ordinal: 1, title: 'Lacuna', content: 'Ausência de comprovante; não concluir pela quitação.' },
    ],
    references: [
      {
        sectionOrdinal: 1,
        kind: 'DOCUMENT',
        itemId: doc.document.id,
        documentVersionId: doc.version.id,
        anchorId: doc.anchors[1].id,
        citationText: doc.anchors[1].text,
      },
    ],
  });
  await page.getByRole('button', { name: 'Ir para o texto' }).click();
  await expect(page).toHaveURL(new RegExp('matterId=' + matter.id));
  await page.getByRole('button', { name: /Relatório do ciclo completo/ }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 2', exact: true })).toHaveValue(
    'Ausência de comprovante; não concluir pela quitação.',
  );
  await page
    .getByRole('textbox', { name: 'Conteúdo da seção 2', exact: true })
    .fill('Ausência de comprovante. Preservar divergência e solicitar documentos.');
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da seção 2', exact: true })).toHaveValue(
    'Ausência de comprovante. Preservar divergência e solicitar documentos.',
  );
  await expect(page).toHaveURL(new RegExp('draftId='));
  await page.getByRole('button', { name: 'Salvar e conferir', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
  // Hold resolution after emission, then reload. Approval must recover the pending request through UI.
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  await page.route('**/draft-approvals/resolve', async (route) => {
    entered();
    await hold;
    await route.abort();
  });
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await started;
  release();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.unroute('**/draft-approvals/resolve');
  await page.reload();
  await page.getByRole('button', { name: /Relatório do ciclo completo/ }).click();
  await page.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByRole('button', { name: /Relatório do ciclo completo Aprovado/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar DOCX da versão salva', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('v2.docx');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('case-flow-mobile.png') });
  expect(received.draftId).toBeTruthy();
});
