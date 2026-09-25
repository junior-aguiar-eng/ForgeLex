import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite } from './PublicSite';

describe('site público', () => {
  it('apresenta o produto completo sem sessão ou dados simulados', () => {
    const html = renderToStaticMarkup(createElement(PublicSite, { page: 'home' }));
    expect(html).toContain('Do caso à minuta, conecte fatos, provas e jurisprudência.');
    expect(html).toContain('Casos e evidências');
    expect(html).toContain('Pesquisa e autoridades');
    expect(html).toContain('Estratégia e documentos');
    expect(html).toContain('Revisão e governança');
    expect(html).toContain('href="/cadastro"');
    expect(html).not.toContain('href="#"');
    expect((html.match(/<details/g) ?? []).length).toBe(10);
  });

  it.each(['product', 'how', 'integrations', 'credits', 'guide', 'api_docs'] as const)(
    'exibe a página %s com título próprio e conteúdo público',
    (page) => {
      const html = renderToStaticMarkup(createElement(PublicSite, { page }));
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
      expect(html).toContain('href="/entrar"');
    },
  );
});
