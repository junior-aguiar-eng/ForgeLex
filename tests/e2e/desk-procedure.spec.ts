import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:3311/api';
const headers = { authorization: 'Bearer phase7-e2e-access-token' };
const hearing = 'Ata sintética. Audiência sem acordo em 09/11.';
const calendar = 'Calendário sintético. Vencimento em 12/11.';
const rule =
  'Regra sintética da homologação. A audiência sem acordo inicia o prazo. O protocolo até o vencimento registrado no calendário é tempestivo.';
const marco = 'A audiência sem acordo fixa o marco inicial.';
const prazo = 'O protocolo ocorreu até o vencimento.';

for (const scenario of ['completo', 'parcial', 'divergência'] as const) {
  test(`homologação processual da Mesa · ${scenario}`, async ({ page }) => {
    const create = await page.request.post(`${api}/v2/matters`, {
      headers,
      data: { title: `Homologação processual · ${scenario}` },
    });
    expect(create.ok()).toBe(true);
    const { id: matterId } = await create.json();
    const filing = `Protocolo sintético. A contestação foi apresentada em ${scenario === 'divergência' ? '13' : '12'}/11.`;
    const documents = [
      { title: 'Ata da audiência', content: hearing },
      { title: 'Calendário do caso', content: calendar },
      ...(scenario === 'parcial' ? [] : [{ title: 'Comprovante de protocolo', content: filing }]),
    ];
    for (const [index, document] of documents.entries()) {
      const uploaded = await page.request.post(`${api}/v2/matters/${matterId}/documents`, {
        headers,
        data: { ...document, originalFilename: `documento-${index}.txt`, mimeType: 'text/plain' },
      });
      expect(uploaded.ok()).toBe(true);
    }
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
    await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/app');
    await page.goto('/app/trabalho');
    await page.getByRole('button', { name: 'Vincular a um caso', exact: true }).click();
    await page.getByLabel('Caso', { exact: true }).selectOption(matterId);
    for (const { title } of documents) await page.getByLabel(title, { exact: true }).check();
    await page.getByRole('textbox', { name: 'O que você precisa fazer?' }).fill(`HOMOLOGAÇÃO PROCESSUAL ${scenario}`);
    await page.getByRole('button', { name: 'Me ajude a começar' }).click();
    const question = page.getByRole('region', { name: 'Pergunta do pedido' });
    for (const choice of ['Cível', 'Elaborar uma peça', 'Contestação']) {
      await question.getByRole('radio', { name: choice, exact: true }).check();
      await question.getByRole('button', { name: 'Continuar', exact: true }).click();
    }
    const sent = page.waitForResponse(
      (res) => res.url() === `${api}/agentic/executions` && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    const response = await sent;
    expect(response.status()).toBe(202);
    const run = await response.json();
    expect(run.matterId).toBe(matterId);

    const article = page.getByRole('article', { name: 'Resultado do trabalho' });
    await expect(article).toBeVisible();
    const deliveryId = await article.getAttribute('data-delivery-id');
    const result = await page.request.get(`${api}/agentic/deliveries/${deliveryId}`, { headers });
    expect(result.ok()).toBe(true);
    const { delivery } = await result.json();
    const verified = scenario === 'completo' ? [marco, prazo] : [marco];
    expect(
      delivery.requirements
        .filter((item: { verified: boolean }) => item.verified)
        .map((item: { statement: string }) => item.statement),
    ).toEqual(verified);
    expect(delivery.procedureAudit).toHaveLength(verified.length);

    await article.getByText('Requisitos processuais verificados', { exact: true }).click();
    const details = article.locator('details').filter({ hasText: 'Requisitos processuais verificados' });
    await expect(details.getByText(marco, { exact: true })).toBeVisible();
    await expect(details.getByText(hearing, { exact: true })).toBeVisible();
    await expect(details.getByText(rule, { exact: true }).first()).toBeVisible();
    await expect(details.getByRole('button', { name: /Fonte \d+ · Norma/ }).first()).toBeVisible();
    if (scenario === 'completo') {
      await expect(details.getByText(prazo, { exact: true })).toBeVisible();
      await expect(details.getByText(filing, { exact: true })).toBeVisible();
      await expect(details.getByText(calendar, { exact: true })).toBeVisible();
    } else {
      await expect(details.getByText(prazo, { exact: true })).toHaveCount(0);
      await article.getByRole('button', { name: /pontos? a conferir/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Fontes e conferência' });
      if (scenario === 'parcial') {
        await expect(dialog.getByText(/A tempestividade depende do comprovante de protocolo/)).toBeVisible();
        await expect(dialog.getByText(/A juntada depende do comprovante correspondente/)).toBeVisible();
      } else {
        await expect(
          dialog.getByText(/O trecho indicado para verificar o requisito não corresponde à fonte exigida/),
        ).toBeVisible();
        expect(
          delivery.findings.some((finding: { code: string }) => finding.code === 'PROCEDURAL_EVIDENCE_MISMATCH'),
        ).toBe(true);
      }
    }
  });
}
