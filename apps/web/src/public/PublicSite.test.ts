import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite } from './PublicSite';

describe('site público', () => {
  it('apresenta pesquisa MCP e conserva os destinos públicos', () => {
    const html = renderToStaticMarkup(createElement(PublicSite, { page: 'home' }));
    expect(html).toContain('Jurisprudência dos tribunais superiores e consulta processual.');
    for (const destination of [
      '/cadastro',
      '/produto',
      '/integracoes',
      '/desenvolvedores/api',
      '/consulta-processual',
    ]) {
      expect(html).toContain(`href="${destination}"`);
    }
    expect(html).toContain('ChatGPT ou Claude');
    expect(html).not.toContain('href="#"');
  });
  it.each(['home', 'product', 'how', 'integrations', 'guide'] as const)(
    'não oferece módulos congelados em %s',
    (page) => {
      const html = renderToStaticMarkup(createElement(PublicSite, { page }));
      for (const destination of [
        '/app/casos',
        '/app/rascunhos',
        '/app/revisao',
        '/produto#casos',
        '/produto#rascunhos',
        '/produto#revisao',
      ]) {
        expect(html).not.toContain(`href="${destination}"`);
      }
      for (const offer of ['Casos e evidências', 'Rascunhos e revisão', 'Estratégia e documentos', 'Do caso à minuta'])
        expect(html).not.toContain(offer);
    },
  );

  it.each(['product', 'how', 'integrations', 'credits', 'guide', 'api_docs'] as const)(
    'exibe a página %s com título próprio e conteúdo público',
    (page) => {
      const html = renderToStaticMarkup(createElement(PublicSite, { page }));
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
      expect(html).toContain('href="/entrar"');
    },
  );

  it('mantém documentos gerais e de encerramento separados no rodapé', () => {
    const html = renderToStaticMarkup(createElement(PublicSite, { page: 'home' }));
    for (const name of ['termos-de-uso', 'privacidade', 'encerramento-de-conta', 'retencao-pos-encerramento']) {
      expect(html).toContain(`href="/legal/${name}.html"`);
    }
    expect((html.match(/<main/g) ?? []).length).toBe(1);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('Pular para o conteúdo');
  });
});
