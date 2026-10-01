import { expect, test } from '@playwright/test';

test('visitante lê o produto e chega ao cadastro sem autenticação', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Do caso à minuta, conecte fatos, provas e jurisprudência.',
  );
  await expect(page.getByText('O acesso ainda não está disponível')).toHaveCount(0);
  await expect(page.locator('main details')).toHaveCount(10);
  await page.getByRole('link', { name: 'Criar acesso' }).first().click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crie seu acesso');
});

test('páginas públicas abrem por URL direta e mantêm seus destinos', async ({ page }) => {
  for (const path of ['/produto', '/como-funciona', '/integracoes', '/creditos', '/guia', '/desenvolvedores/api']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('O acesso ainda não está disponível');
  }
  await page.goto('/produto#pesquisa');
  await expect(page.locator('#pesquisa')).toBeVisible();
});

test('rota protegida e retorno de pagamento preservam o acesso', async ({ page }) => {
  for (const path of [
    '/casos',
    '/pesquisa',
    '/rascunhos',
    '/revisao',
    '/conectar',
    '/conta',
    '/guia/mcp',
    '/app/conta/chaves',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  }
  await page.goto('/?billing_purchase=pedido-sintetico&status=approved');
  await expect(page).toHaveURL(/\/app\/conta\?billing_purchase=pedido-sintetico&status=approved$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
});

test('erro de recuperação na raiz permite solicitar outro link', async ({ page }) => {
  await page.goto('/#error=access_denied');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('O link expirou');
  await expect(page).toHaveURL(/#error=access_denied$/);
  await page.getByRole('button', { name: 'Solicitar outro link' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recupere seu acesso');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
});

test('menu mobile abre por teclado e fecha com Escape', async ({ page }) => {
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Abrir menu' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'Navegação pública mobile' })).toBeVisible();
    const menuLinks = page.getByRole('navigation', { name: 'Navegação pública mobile' }).getByRole('link');
    await expect(menuLinks.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(menuLinks.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menuLinks.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('metadados e documentos legais correspondem às rotas públicas', async ({ page }) => {
  const descriptions = new Set<string>();
  for (const path of [
    '/',
    '/produto',
    '/como-funciona',
    '/integracoes',
    '/creditos',
    '/guia',
    '/desenvolvedores/api',
  ]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://nexojuris.ia.br${path}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    descriptions.add((await page.locator('meta[name="description"]').getAttribute('content'))!);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
  expect(descriptions.size).toBe(7);
  for (const label of ['Termos de uso', 'Política de Privacidade']) {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('junior-aguiar@hotmail.com.br');
  }
});

test('FAQ e layout permanecem legíveis nas larguras previstas', async ({ page }) => {
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1366, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of [
      '/',
      '/produto',
      '/como-funciona',
      '/integracoes',
      '/creditos',
      '/guia',
      '/desenvolvedores/api',
    ]) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${width}px: ${path}`,
      ).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
    }
  }
  await page.goto('/');
  const question = page.getByText('O ForgeLex escreve petições sozinho?');
  await question.click();
  await expect(page.getByText('A decisão jurídica, a conferência final')).toBeVisible();
});

test('endereço desconhecido não recebe canonical nem autorização de indexação', async ({ page }) => {
  await page.goto('/endereco-inexistente');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este endereço não está disponível.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
