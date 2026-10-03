import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('indexação pública', () => {
  it('não incorpora credenciais de servidor no JavaScript distribuído', () => {
    const directory = 'apps/web/dist/assets';
    const files = readdirSync(directory).filter((file) => file.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = readFileSync(`${directory}/${file}`, 'utf8');
      expect(
        /sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/.test(
          code,
        ),
        file,
      ).toBe(false);
      for (const token of code.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
        let role: unknown;
        try {
          role = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role;
        } catch {
          continue;
        }
        expect(role, file).not.toBe('service_role');
      }
    }
  });
  it('inclui somente as páginas públicas canônicas no sitemap', () => {
    const xml = readFileSync('apps/web/public/sitemap.xml', 'utf8');
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    expect(urls).toEqual(
      ['/', '/produto', '/como-funciona', '/integracoes', '/creditos', '/guia', '/consulta-processual', '/desenvolvedores/api'].map(
        (path) => `https://nexojuris.ia.br${path}`,
      ),
    );
    expect(xml).not.toMatch(/\/app|\/entrar|\/cadastro|billing_purchase|callback|hml\./);
  });
  it('mantém autenticação, conta e superfícies técnicas fora da indexação', () => {
    const robots = readFileSync('apps/web/public/robots.txt', 'utf8');
    for (const path of ['/app', '/entrar', '/cadastro', '/conta', '/api', '/mcp'])
      expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain('Sitemap: https://nexojuris.ia.br/sitemap.xml');
    const html = readFileSync('apps/web/index.html', 'utf8');
    for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale'])
      expect(html).toContain(`property="${property}"`);
    expect(html).toContain('name="twitter:card"');
  });
});
