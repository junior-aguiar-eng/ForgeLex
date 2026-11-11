import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import cases from '../fixtures/desk-pilot-cases.json';

const api =
  process.env.FORGELEX_E2E_PILOT_PREVIEW === 'true' ? 'http://127.0.0.1:3361/api' : 'http://127.0.0.1:3311/api';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const internal =
  /piloto-(forma|materia)-|Referência interna sintética|catalogo-piloto|acervo-r15-avaliacao-local|forgelex-r15-revisao-local|skillSnapshot|skillReferences|guidanceHash/;
let capturedMarkers: string[] = [];

test.beforeAll(({}, info) => {
  const mode = String(info.config.metadata.deskPilotMode);
  if (!mode.startsWith('captured') && mode !== 'revised') return;
  const loader = mode === 'revised' ? 'loadRevisedPilot' : 'loadCapturedPilot';
  // Run the archive reader as native ESM, outside Playwright's TypeScript transform.
  capturedMarkers = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { ${loader} } from './scripts/skills/load-captured-pilot.mjs';
         const entries = await ${loader}(process.env.FORGELEX_E2E_SKILL_ARCHIVE);
         console.log(JSON.stringify(entries.flatMap(({id, content}) => {
           const excerpt = content.split('\\n').find((line) => !line.startsWith('#') && line.trim().length > 65);
           return [id, excerpt.trim().slice(0, 65)];
         })));`,
      ],
      { encoding: 'utf8' },
    ),
  );
});

function expectPublic(text: string) {
  expect(internal.test(text) || capturedMarkers.some((marker) => text.includes(marker))).toBe(false);
}

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

const guideQuestion = (page: Page) => page.getByRole('region', { name: 'Pergunta do pedido' });
const guideSummary = (page: Page) => page.getByRole('region', { name: 'Resumo do pedido' });

async function choose(page: Page, choice: string, button = 'Continuar') {
  const question = guideQuestion(page);
  await question.getByRole('radio', { name: choice, exact: true }).check();
  const prompt = await question.locator('legend').innerText();
  await question.getByRole('button', { name: button, exact: true }).click();
  return prompt;
}

for (const scenario of cases) {
  test(`piloto da Mesa · ${scenario.id}`, async ({ page }, info) => {
    const mode = info.config.metadata.deskPilotMode;
    const guided = mode !== 'baseline';
    const orientationPrompts: string[] = [];
    let executionQuestions = 0;
    const created = await page.request.post(`${api}/v2/matters`, {
      headers,
      data: { title: `Caso sintético do piloto · ${scenario.id}` },
    });
    expect(created.ok()).toBe(true);
    const { id: matterId } = await created.json();
    const read = async (path: string) => {
      const response = await page.request.get(api + path, { headers });
      expect(response.ok()).toBe(true);
      const body = await response.text();
      expectPublic(body);
      return JSON.parse(body);
    };
    const send = async (button: string, path: string) => {
      const posted = page.waitForResponse(
        (response) => response.url() === api + path && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: button, exact: true }).click();
      const response = await posted;
      const body = await response.text();
      expect(response.status(), body).toBe(202);
      expectPublic(body);
      return JSON.parse(body);
    };

    await login(page);
    await page.getByRole('button', { name: 'Sem caso', exact: true }).click();
    await page.getByLabel('Caso (opcional)').selectOption(matterId);
    await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill(scenario.objective);
    const helper = page.getByRole('button', { name: 'Me ajude a começar' });
    const question = guideQuestion(page);
    if (guided) {
      await helper.click();
      for (const [prompt, choice] of [
        ['Em qual área você precisa trabalhar?', scenario.area],
        ['O que você precisa fazer?', 'Elaborar uma peça'],
        ['Qual peça você precisa elaborar?', scenario.piece ?? 'Não sei'],
      ]) {
        await expect(question.locator('legend')).toHaveText(prompt);
        orientationPrompts.push(await choose(page, choice));
      }
      await expect(question).toHaveCount(0);
      await expect(guideSummary(page)).toContainText(scenario.piece ?? 'Peça a definir');
    } else {
      await expect(helper).toHaveCount(0);
    }

    let run = await send('Enviar', '/agentic/executions');
    expect(run.matterId).toBe(matterId);
    if (guided && !scenario.piece) {
      await expect(page.getByText('Você quer preparar a resposta à acusação?', { exact: true })).toBeVisible();
      const waiting = await read(`/agentic/executions/${run.id}`);
      expect(waiting.status).toBe('WAITING_USER');
      expect(waiting.question.prompt).toBe('Você quer preparar a resposta à acusação?');
      executionQuestions++;
      expect(waiting.deliveryIds).toEqual([]);
      expect((await read(`/v2/matters/${matterId}/drafts`)).items).toEqual([]);
      await page.getByRole('checkbox', { name: 'Ainda não sei' }).check();
      const previous = run;
      run = await send('Enviar resposta', `/agentic/executions/${run.id}/answers`);
      expect(run.conversationId).toBe(previous.conversationId);
      expect(run.contextRevision).toBeGreaterThan(previous.contextRevision);
    }

    const executionPath = `/agentic/executions/${run.id}`;
    await expect.poll(async () => (await read(executionPath)).status).toBe('COMPLETED');
    const completed = await read(executionPath);
    expect(completed.question).toBeNull();
    expect(completed.deliveryIds).toHaveLength(1);
    const { delivery } = await read(`/agentic/deliveries/${completed.deliveryIds[0]}`);
    expect(delivery.humanReviewRequired).toBe(true);
    expect(delivery.legalAssessment).toBe('NOT_EVALUATED');
    const [sourceId] = delivery.issues[0].sourceIds;
    expect(delivery.sources).toContainEqual(
      expect.objectContaining({
        id: sourceId,
        kind: 'USER_TEXT',
        contentHash: createHash('sha256').update(scenario.objective).digest('hex'),
      }),
    );
    const draftsPath = `/v2/matters/${matterId}/drafts`;
    const { items } = await read(draftsPath);
    await expect(page.getByRole('article', { name: 'Resultado do trabalho' })).toBeVisible();
    if (scenario.piece) {
      expect(items).toHaveLength(1);
      expect(delivery.document.sections[0].content).toBe(scenario.objective);
      const { currentVersion, versions } = await read(`${draftsPath}/${items[0].id}`);
      expect(versions).toHaveLength(1);
      expect(currentVersion.sections[0].content).toBe(scenario.objective);
      await expect(page.getByRole('textbox', { name: 'Texto da seção 1' })).toHaveValue(scenario.objective);
      if (mode === 'captured-limited') {
        expect(delivery.findings).toContainEqual(
          expect.objectContaining({ code: 'SUPPORTING_CONTEXT_LIMITED', statement: expect.stringContaining('excede') }),
        );
      } else if (mode === 'captured' || mode === 'revised') {
        expect(delivery.findings).not.toContainEqual(expect.objectContaining({ code: 'SUPPORTING_CONTEXT_LIMITED' }));
      }
      if (mode === 'revised') {
        const expectedCode = { custodia: 'CUSTODY_RECORDS_TO_VERIFY', civel: 'PARTIAL_PAYMENT_TO_VERIFY' }[
          scenario.id as 'custodia' | 'civel'
        ];
        const checks = delivery.findings.filter(({ code }: { code: string }) =>
          ['CUSTODY_RECORDS_TO_VERIFY', 'PARTIAL_PAYMENT_TO_VERIFY'].includes(code),
        );
        expect(checks).toEqual(
          expectedCode ? [expect.objectContaining({ code: expectedCode, sourceIds: [sourceId] })] : [],
        );
      }
    } else {
      expect(items).toEqual([]);
      expect(delivery.document).toBeUndefined();
      if (guided) {
        expect(delivery.findings).toContainEqual(
          expect.objectContaining({ code: 'GUIDANCE_UNCONFIRMED', sourceIds: [sourceId] }),
        );
      }
    }
    expectPublic(await page.locator('body').innerHTML());
    const repeatedOrientationPrompts = orientationPrompts.length - new Set(orientationPrompts).size;
    expect(repeatedOrientationPrompts).toBe(0);
    console.info(
      JSON.stringify({
        check: 'desk-pilot-public',
        mode,
        case: scenario.id,
        orientationQuestions: orientationPrompts.length,
        repeatedOrientationPrompts,
        executionQuestions,
        drafts: items.length,
        deliveryIntegrity: 'passed',
        legalAssessment: delivery.legalAssessment,
      }),
    );
  });
}

if (process.env.FORGELEX_E2E_DESK_PILOT === 'expanded') {
  test('lote ampliado registra correção e saída da orientação antes do envio', async ({ page }) => {
    await login(page);
    const submissions: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url() === `${api}/agentic/executions`) submissions.push(request.url());
    });
    const objective = 'Organizar o relato local para conferência.';
    const input = page.getByRole('textbox', { name: 'O que você precisa fazer?' });
    await input.fill(objective);
    await page.getByRole('button', { name: 'Me ajude a começar' }).click();
    await choose(page, 'Penal');
    await choose(page, 'Elaborar uma peça');
    await choose(page, 'Resposta à acusação');
    const summary = guideSummary(page);
    await expect(summary).toContainText('Resposta à acusação');
    const before = new URL(page.url()).searchParams;
    await summary.getByRole('button', { name: 'Alterar', exact: true }).click();
    await summary.getByRole('button', { name: 'Alterar área' }).click();
    const correction = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/correct'),
    );
    await choose(page, 'Cível', 'Salvar alteração');
    expect((await correction).ok()).toBe(true);
    await choose(page, 'Contestação');
    await expect(summary).toContainText('Contestação');
    await expect(summary).not.toContainText('Resposta à acusação');
    const after = new URL(page.url()).searchParams;
    expect(after.get('conversationId')).toBe(before.get('conversationId'));
    expect(Number(after.get('contextRevision'))).toBeGreaterThan(Number(before.get('contextRevision')));
    await summary.getByRole('button', { name: 'Alterar', exact: true }).click();
    await summary.getByRole('button', { name: 'Voltar ao pedido livre' }).click();
    await expect(summary).toHaveCount(0);
    await expect(input).toHaveValue(objective);
    await expect(page).not.toHaveURL(/[?&](conversationId|executionId)=/);
    expect(submissions).toHaveLength(0);
    console.info(JSON.stringify({ check: 'desk-pilot-exit', mode: 'expanded', corrections: 1, exitsBeforeSend: 1 }));
  });
}
