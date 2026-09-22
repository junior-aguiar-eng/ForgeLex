import { expect, test, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:3001';

async function closeDisposableAccount(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Conta descartável')).toBeVisible();
  const stillValidJwt = await page.evaluate(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.includes('auth-token'))?.[1];
    return raw ? (JSON.parse(raw).access_token as string) : '';
  });
  expect(stillValidJwt).not.toBe('');
  await page.getByRole('button', { name: 'Segurança da conta' }).click();
  await expect(page.getByRole('heading', { name: 'Encerrar conta e espaço pessoal' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Confirmo que desejo encerrar/ }).check();
  await page.getByRole('button', { name: 'Continuar para confirmação de identidade' }).click();
  await page.getByLabel('Confirme sua senha atual').fill(password);
  await page.getByRole('button', { name: 'Confirmar senha' }).click();
  await page.getByLabel('Digite exatamente ENCERRAR MINHA CONTA').fill('ENCERRAR MINHA CONTA');
  const accepted = page.waitForResponse(
    (response) => response.url() === `${api}/api/v2/account/closure` && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Solicitar encerramento' }).click();
  const response = await accepted;
  expect(response.status()).toBe(202);
  await expect(page.getByRole('heading', { name: 'Acompanhamento do encerramento' })).toBeVisible();
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
