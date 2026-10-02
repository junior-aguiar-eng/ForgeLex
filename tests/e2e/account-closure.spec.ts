import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const api = 'http://127.0.0.1:3001';

async function closeDisposableAccount(
  page: Page,
  email: string,
  password: string,
  audit?: (stage: string) => Promise<void>,
) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  const stillValidJwt = await page.evaluate(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.includes('auth-token'))?.[1];
    return raw ? (JSON.parse(raw).access_token as string) : '';
  });
  expect(stillValidJwt).not.toBe('');
  if ((page.viewportSize()?.width ?? 1366) >= 768) {
    await page.getByRole('button', { name: 'Segurança da conta' }).click();
  } else {
    await page.goto('/conta/seguranca');
  }
  await expect(page.getByRole('heading', { name: 'Encerrar conta e espaço pessoal' })).toBeVisible();
  await audit?.('explanation');
  await page.getByRole('checkbox', { name: /Confirmo que desejo encerrar/ }).check();
  await page.getByRole('button', { name: 'Continuar para confirmação de identidade' }).click();
  await audit?.('password');
  await page.getByLabel('Confirme sua senha atual').fill(password);
  await page.getByRole('button', { name: 'Confirmar senha' }).click();
  await page.getByLabel('Digite exatamente ENCERRAR MINHA CONTA').fill('ENCERRAR MINHA CONTA');
  await audit?.('confirmation');
  const accepted = page.waitForResponse(
    (response) => response.url() === `${api}/api/v2/account/closure` && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Solicitar encerramento' }).click();
  const response = await accepted;
  expect(response.status()).toBe(202);
  await expect(page.getByRole('heading', { name: 'Acompanhamento do encerramento' })).toBeVisible();
  await audit?.('receipt');
  const receipt = (await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('forgelex_account_closure_active') ?? 'null'),
  )) as { closureId: string; statusToken: string };
  expect(receipt.closureId).toBeTruthy();
  expect(receipt.statusToken).toBeTruthy();
  const blocked = await page.request.get(`${api}/api/v2/auth/me`, {
    headers: { authorization: `Bearer ${stillValidJwt}` },
  });
  expect(blocked.status()).toBe(401);
  expect((await blocked.json()).error).toBe('UNAUTHENTICATED');
  const bootstrap = await page.request.post(`${api}/api/v2/auth/bootstrap`, {
    headers: { authorization: `Bearer ${stillValidJwt}` },
    data: { displayName: 'Conta descartável' },
  });
  expect(bootstrap.status()).toBe(403);
  expect((await bootstrap.json()).error).toBe('ACCOUNT_CLOSED');
  return { receipt, stillValidJwt };
}

async function auditClosure(page: Page, testInfo: TestInfo, stage: string) {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach(`wcag-${stage}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.violations.map((rule) => ({ id: rule.id, targets: rule.nodes.map((node) => node.target) }))).toEqual(
    [],
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const spacing = await page.addStyleTag({
    content:
      '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
  });
  await testInfo.attach(`overflow-${stage}`, {
    body: JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            text: element.textContent?.slice(0, 120),
            right: element.getBoundingClientRect().right,
          })),
      ),
    ),
    contentType: 'application/json',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'reflow com espaçamento WCAG 1.4.12',
  ).toBe(true);
  const screenshotPath = testInfo.outputPath(`text-spacing-${stage}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`text-spacing-${stage}`, { path: screenshotPath, contentType: 'image/png' });
  await spacing.evaluate((element) => element.remove());
}

for (const width of [1366, 320]) {
  test(`acessibilidade do encerramento em ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = (await (await request.post(`${api}/e2e/reset`)).json()) as { email: string; password: string };
    const { receipt } = await closeDisposableAccount(page, fixture.email, fixture.password, (stage) =>
      auditClosure(page, testInfo, stage),
    );
    for (let step = 0; step < 5; step += 1) {
      const response = await request.post(`${api}/e2e/reconcile`, { data: { closureId: receipt.closureId } });
      expect(await response.json(), `reconciliação ${step + 1}`).toMatchObject({ result: 'completed' });
    }
    const status = await request.get(`${api}/api/v2/account/closure/${receipt.closureId}`, {
      headers: { 'x-closure-token': receipt.statusToken },
    });
    expect(await status.json()).toMatchObject({ status: 'COMPLETED' });
    await expect(page.getByRole('heading', { name: 'Encerramento concluído' })).toBeVisible();
    await auditClosure(page, testInfo, 'completed');
  });
}

test('encerra conta descartável, bloqueia JWT válido e elimina o token do recibo', async ({ page, request }) => {
  const fixture = (await (await request.post(`${api}/e2e/reset`)).json()) as { email: string; password: string };
  const { receipt } = await closeDisposableAccount(page, fixture.email, fixture.password);
  for (let step = 0; step < 5; step += 1) {
    expect((await request.post(`${api}/e2e/reconcile`)).ok()).toBe(true);
  }
  const status = await request.get(`${api}/api/v2/account/closure/${receipt.closureId}`, {
    headers: { 'x-closure-token': receipt.statusToken },
  });
  expect((await status.json()).status).toBe('COMPLETED');
  await expect(page.getByRole('heading', { name: 'Encerramento concluído' })).toBeVisible({ timeout: 10_000 });
  const storage = await page.evaluate(() => Object.values(sessionStorage));
  expect(storage.some((value) => value.includes(receipt.statusToken))).toBe(false);
  const auth = await request.post('http://127.0.0.1:15431/auth/v1/token?grant_type=password', {
    form: { email: fixture.email, password: fixture.password },
  });
  expect(auth.status()).toBe(400);
  expect((await (await request.get(`${api}/e2e/state`)).json()).deletedCount).toBe(1);
});

test('falha do provedor mantém bloqueio e retomada conclui sem recriar identidade', async ({ page, request }) => {
  const fixture = (await (await request.post(`${api}/e2e/reset`)).json()) as { email: string; password: string };
  const { receipt, stillValidJwt } = await closeDisposableAccount(page, fixture.email, fixture.password);
  await request.post(`${api}/e2e/fail-next-delete`);
  const failed = await request.post(`${api}/e2e/reconcile`);
  expect((await failed.json()).result).toBe('failed');
  const pending = await request.get(`${api}/api/v2/account/closure/${receipt.closureId}`, {
    headers: { 'x-closure-token': receipt.statusToken },
  });
  expect((await pending.json()).status).toBe('RECONCILIATION_REQUIRED');
  const blocked = await request.get(`${api}/api/v2/auth/me`, { headers: { authorization: `Bearer ${stillValidJwt}` } });
  expect((await blocked.json()).error).toBe('UNAUTHENTICATED');
  expect((await (await request.post(`${api}/e2e/resume/${receipt.closureId}`)).json()).resumed).toBe(true);
  expect((await (await request.post(`${api}/e2e/resume/${receipt.closureId}`)).json()).resumed).toBe(false);
  for (let step = 0; step < 5; step += 1) await request.post(`${api}/e2e/reconcile`);
  const complete = await request.get(`${api}/api/v2/account/closure/${receipt.closureId}`, {
    headers: { 'x-closure-token': receipt.statusToken },
  });
  expect((await complete.json()).status).toBe('COMPLETED');
  expect((await (await request.get(`${api}/e2e/state`)).json()).deletedCount).toBe(1);
});
