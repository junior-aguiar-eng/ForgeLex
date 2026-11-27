import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const api = process.env.FORGELEX_TEST_API_ORIGIN ?? 'http://127.0.0.1:3301';

test('análise documental recebida: conferir fonte, editar e incorporar no caso', async ({ page, request }, info) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const headers = { authorization: 'Bearer phase7-e2e-access-token' };
  const matter = await (
    await request.post(api + '/api/v2/matters', { headers, data: { title: 'Análise documental sintética' } })
  ).json();
  const document = await (
    await request.post(api + `/api/v2/matters/${matter.id}/documents`, {
      headers,
      data: {
        title: 'Contrato para análise',
        originalFilename: 'contrato.txt',
        mimeType: 'text/plain',
        content: 'A parte afirma que houve pagamento em janeiro.\n\nO contrato não contém recibo de pagamento.',
      },
    })
  ).json();
  await login(page);
  await page.goto(`/app/casos?caso=${matter.id}`);
  await page.getByRole('button', { name: 'Analisar documentos do caso', exact: true }).click();
  await page.getByLabel('Onde você vai usar?').selectOption('Claude');
  await page.getByLabel('Aplicativo autorizado').selectOption('app-one');
  await page.locator('dialog summary').filter({ hasText: 'Documentos' }).click();
  await page.locator('dialog label').filter({ hasText: 'Contrato para análise' }).getByRole('checkbox').check();
  await page.getByLabel('Permitir que esta IA envie análises do caso').check();
  await page.getByLabel('Objetivo da análise').fill('Confrontar alegação de pagamento');

  await page.getByRole('button', { name: 'Autorizar e copiar instrução', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copiar instrução', exact: true })).toBeVisible();
  const context = (await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: matter.id })).result
    .structuredContent;
  expect(context.analysisReceiving).toEqual({ enabled: true, objective: 'Confrontar alegação de pagamento' });
  const anchor = document.anchors[0];
  const input = {
    matterId: matter.id,
    expectedGrantRevision: context.grantRevision,
    idempotencyKey: 'synthetic-analysis-key-1',
    objective: context.analysisReceiving.objective,
    items: [
      {
        id: 'fact1',
        kind: 'FACT',
        text: 'Houve pagamento em janeiro',
        classification: 'ALLEGATION',
        sources: [
          {
            documentId: document.document.id,
            versionId: document.version.id,
            anchorId: anchor.id,
            quote: anchor.text,
            relation: 'CONTEXT',
          },
        ],
      },
      {
        id: 'gap1',
        kind: 'GAP',
        text: 'Falta comprovante de pagamento',
        classification: 'GAP',
        sources: [
          {
            documentId: document.document.id,
            versionId: document.version.id,
            anchorId: anchor.id,
            quote: anchor.text,
            relation: 'CONTEXT',
          },
        ],
      },
    ],
  };
  const saved = await mcp(request, state.oauthTokens['app-one'], 'case.save_analysis', input);
  expect(saved.result.isError).toBe(false);
  expect((await mcp(request, state.oauthTokens['app-one'], 'case.save_analysis', input)).result.billing.isReplay).toBe(
    true,
  );
  await page.locator('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Conferir análise', exact: true }).click();
  const proposal = page.getByRole('article', { name: 'Proposta fact1' });
  await expect(proposal).toContainText('Alegação');
  await proposal.getByRole('button', { name: 'Abrir fonte', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('A parte afirma que houve pagamento');
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar leitura', exact: true }).click();
  await proposal.getByRole('button', { name: 'Editar', exact: true }).click();
  await proposal.getByLabel('Texto da proposta').fill('A parte alega pagamento em janeiro');
  await proposal.getByRole('checkbox', { name: 'Selecionar proposta' }).check();
  await page.getByRole('button', { name: 'Incorporar selecionados', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Itens incorporados');
  await page
    .getByRole('article', { name: 'Proposta gap1' })
    .getByRole('button', { name: 'Descartar', exact: true })
    .click();
  const facts = (await (await request.get(api + `/api/v2/matters/${matter.id}/facts`, { headers })).json()).items;
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({ statement: 'A parte alega pagamento em janeiro', status: 'ASSERTED' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.getByRole('region', { name: 'Análises dos documentos' }).evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Análises dos documentos"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole('region', { name: 'Análises dos documentos' })
    .screenshot({ path: info.outputPath('analysis-review-mobile.png') });
});

// Regra do mínimo (decisão de Boni, 26/11/2026): a conexão que o usuário aprovou no login da IA dele vale para os casos
// ativos da conta, sem painel. Estes testes guardam os limites que continuam valendo: só conexão OAuth lê pelo conector,
// cada conexão tem a própria permissão, a revogação é respeitada e caso fora de uso não é lido.
const session = { authorization: 'Bearer phase7-e2e-access-token' };

async function caseWithDocument(request: APIRequestContext, title: string, content: string) {
  const matter = await (await request.post(api + '/api/v2/matters', { headers: session, data: { title } })).json();
  const document = await (
    await request.post(api + `/api/v2/matters/${matter.id}/documents`, {
      headers: session,
      data: { title: `Documento de ${title}`, originalFilename: 'doc.txt', mimeType: 'text/plain', content },
    })
  ).json();
  return { matter, document };
}

test('a conexão aprovada lê o caso ativo sozinha, sem painel e sem cobrança, e o caso aparece na lista compartilhada', async ({
  request,
}) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const title = `Leitura automática ${Date.now()}`;
  const { matter, document } = await caseWithDocument(request, title, 'CONTEÚDO LIDO PELA CONEXÃO APROVADA');
  const token = state.oauthTokens['app-one'];

  const context = await mcp(request, token, 'case.get_context', { matterId: matter.id });
  expect(context.result.isError).toBe(false);
  expect(context.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0 });
  expect(context.result.structuredContent.items.map((item: { id: string }) => item.id)).toContain(document.document.id);
  // A IA pode mandar peça nova para o caso; ela espera a revisão do usuário.
  expect(context.result.structuredContent.draftReceiving).toMatchObject({
    enabled: true,
    destination: { mode: 'NEW' },
  });

  const item = await mcp(request, token, 'case.read_item', {
    matterId: matter.id,
    kind: 'DOCUMENT',
    itemId: document.document.id,
  });
  expect(JSON.stringify(item.result.structuredContent)).toContain('CONTEÚDO LIDO PELA CONEXÃO APROVADA');

  const shared = await mcp(request, token, 'case.list_shared');
  expect(shared.result.structuredContent.items.map((entry: { matterId: string }) => entry.matterId)).toContain(
    matter.id,
  );
  const ledger = await (await request.get(api + '/api/v2/billing/transactions', { headers: session })).json();
  expect(JSON.stringify(ledger)).not.toContain(matter.id);
});

test('cada conexão tem a própria permissão; a sessão do site e um token desconhecido não leem pelo conector', async ({
  request,
}) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const { matter } = await caseWithDocument(request, `Duas conexões ${Date.now()}`, 'Conteúdo de duas conexões.');

  expect(
    (await mcp(request, state.oauthTokens['app-one'], 'case.get_context', { matterId: matter.id })).result.isError,
  ).toBe(false);
  expect(
    (await mcp(request, state.oauthTokens['app-two'], 'case.get_context', { matterId: matter.id })).result.isError,
  ).toBe(false);
  const grants = await (await request.get(api + `/api/v2/matters/${matter.id}/ai-access`, { headers: session })).json();
  expect(grants.map((grant: { oauthClientId: string }) => grant.oauthClientId).sort()).toEqual(['app-one', 'app-two']);

  // A sessão do site não é uma conexão OAuth: pelo conector, as ferramentas de caso não leem nada.
  expectCaseDenied(await mcp(request, 'phase7-e2e-access-token', 'case.get_context', { matterId: matter.id }));
  const unknown = await request.post(api + '/mcp', {
    headers: { authorization: 'Bearer token-desconhecido' },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'case.get_context', arguments: { matterId: matter.id } },
    },
  });
  expect(unknown.status()).toBe(401);
});

test('a revogação de uma conexão é respeitada e não volta sozinha; a outra conexão segue lendo', async ({
  request,
}) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const { matter } = await caseWithDocument(request, `Revogação ${Date.now()}`, 'Conteúdo da revogação.');
  const one = state.oauthTokens['app-one'];
  const two = state.oauthTokens['app-two'];
  await mcp(request, one, 'case.get_context', { matterId: matter.id });
  await mcp(request, two, 'case.get_context', { matterId: matter.id });

  const grants = await (await request.get(api + `/api/v2/matters/${matter.id}/ai-access`, { headers: session })).json();
  const first = grants.find((grant: { oauthClientId: string }) => grant.oauthClientId === 'app-one');
  const revoked = await request.post(api + `/api/v2/matters/${matter.id}/ai-access/${first.id}/revoke`, {
    headers: session,
    data: { expectedRevision: first.revision },
  });
  expect(revoked.status()).toBe(200);

  // Duas chamadas seguidas: a sincronização automática não devolve o acesso revogado.
  expectCaseDenied(await mcp(request, one, 'case.get_context', { matterId: matter.id }));
  expectCaseDenied(await mcp(request, one, 'case.get_context', { matterId: matter.id }));
  expect((await mcp(request, two, 'case.get_context', { matterId: matter.id })).result.isError).toBe(false);
});

test('caso arquivado não é lido pelo conector, e caso novo entra sem painel', async ({ request }) => {
  const state = await (await request.get(api + '/e2e/state')).json();
  const token = state.oauthTokens['app-one'];
  const { matter } = await caseWithDocument(request, `Arquivado ${Date.now()}`, 'Conteúdo do caso arquivado.');
  expect((await mcp(request, token, 'case.get_context', { matterId: matter.id })).result.isError).toBe(false);

  const current = await (await request.get(api + `/api/v2/matters/${matter.id}`, { headers: session })).json();
  const archived = await request.post(api + `/api/v2/matters/${matter.id}/archive`, {
    headers: session,
    data: { expectedLifecycleRevision: current.lifecycleRevision ?? 0 },
  });
  expect(archived.status()).toBe(200);
  expectCaseDenied(await mcp(request, token, 'case.get_context', { matterId: matter.id }));
  const shared = await mcp(request, token, 'case.list_shared');
  expect(shared.result.structuredContent.items.map((entry: { matterId: string }) => entry.matterId)).not.toContain(
    matter.id,
  );

  // Caso criado depois, ainda sem documento (como nasce na Pasta), entra na próxima chamada.
  const fresh = await (
    await request.post(api + '/api/v2/matters', { headers: session, data: { title: `Caso novo ${Date.now()}` } })
  ).json();
  const after = await mcp(request, token, 'case.list_shared');
  expect(after.result.structuredContent.items.map((entry: { matterId: string }) => entry.matterId)).toContain(fresh.id);
});

async function login(page: Page) {
  const bootstrap = page.waitForResponse(
    (r) => r.url().endsWith('/api/v2/auth/bootstrap') && r.request().method() === 'POST',
  );
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('contexto@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);
  await page.waitForURL('**/app');
}
async function mcp(request: APIRequestContext, token: string, name: string, args: unknown = {}) {
  const r = await request.post(api + '/mcp', {
    headers: { authorization: 'Bearer ' + token },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
function expectCaseDenied(reply: any) {
  expect(reply).not.toHaveProperty('error');
  expect(reply.result.isError).toBe(true);
  expect(reply.result).not.toHaveProperty('structuredContent');
  expect(reply.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0, isReplay: false });
  expect(JSON.parse(reply.result.content[0].text).error).toMatchObject({
    code: 'CASE_CONTEXT_NOT_AUTHORIZED',
    message: expect.stringContaining('Este material não está autorizado para o aplicativo.'),
  });
}
