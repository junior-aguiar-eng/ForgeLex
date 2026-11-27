import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite } from './PublicSite';
import { metadataFor } from './public-metadata';

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

// Site no modelo novo, recentrado na Mesa em 27/11/2026 (pedido de Boni): a Mesa e a produção de peças no centro; a
// jurisprudência com fonte e o MCP como temas transversais. Quatro páginas: Início, Como funciona, Preços e Conectar.
describe('site público no modelo novo, centrado na Mesa (27/11)', () => {
  const title = 'Peças jurídicas prontas para revisar, com a jurisprudência na fonte.';
  const render = (page: Parameters<typeof PublicSite>[0]['page'], model = true) =>
    renderToStaticMarkup(createElement(PublicSite, { page, model }));
  const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const html = render('home');
  const text = textOf(html);

  it('um só h1 com o título proposto, a Mesa logo depois do topo e o veto ao título rejeitado', () => {
    expect(html).toContain(title);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html.indexOf('id="mesa-de-trabalho"')).toBeGreaterThan(html.indexOf('<h1'));
    expect(html).not.toContain('A inteligência jurídica que pensa antes de peticionar.');
  });

  it('jurisprudência com fonte e uso na sua IA aparecem como temas transversais, depois da Mesa', () => {
    const mesa = html.indexOf('id="mesa-de-trabalho"');
    expect(html.indexOf('id="jurisprudencia"')).toBeGreaterThan(mesa);
    expect(html.indexOf('id="sua-ia"')).toBeGreaterThan(mesa);
    expect(text).toContain('Jurisprudência que dá para conferir');
    expect(text).toContain('ChatGPT ou o Claude, por MCP');
  });

  it('a Mesa é descrita pelo que está no ar, sem o que saiu e sem preço escrito', () => {
    for (const phrase of [
      'Descreva e anexe',
      'PDF, texto ou Markdown',
      'só o texto extraído acompanha o pedido',
      'Pasta',
    ])
      expect(text, phrase).toContain(phrase);
    for (const absent of [
      'OCR',
      'Word',
      '.docx',
      'agentes analíticos',
      'Gemini',
      'vigência',
      'está suspenso',
      'pesquisa salva',
      'API REST',
      'consulta processual',
      'guia',
    ])
      expect(text, absent).not.toContain(absent);
    expect(text).not.toMatch(/R\$\s?\d/);
  });

  it('o cabeçalho tem só Como funciona e Preços, além de Entrar e Criar acesso; nada leva às páginas removidas', () => {
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(textOf(header)).toContain('Como funciona');
    expect(textOf(header)).toContain('Preços');
    for (const removed of ['/produto', '/integracoes', '/guia', '/desenvolvedores/api', '/consulta-processual'])
      for (const page of ['home', 'how', 'credits'] as const)
        expect(render(page), `${page} ${removed}`).not.toContain(`href="${removed}`);
  });

  it('Como funciona abre pela Mesa e mostra a conexão com a sua IA; Preços fala da Mesa e da pesquisa', () => {
    const how = textOf(render('how'));
    expect(how.indexOf('Na Mesa de trabalho')).toBeGreaterThan(-1);
    expect(how).toContain('Na sua IA');
    const prices = textOf(render('credits'));
    expect(prices).toContain('Você paga só pelo uso.');
    expect(prices).toContain('o custo máximo aparece antes de enviar');
    expect(prices).toContain('custos próprios');
    expect(prices).not.toMatch(/R\$\s?\d/);
  });

  it('o rodapé apresenta a Mesa e leva só a Início, Como funciona, Preços, Conectar sua IA e os documentos legais', () => {
    const footer = textOf(html.slice(html.indexOf('<footer')));
    expect(footer).toContain(
      'Mesa de trabalho para peças jurídicas, com a jurisprudência na fonte e uso na sua IA por MCP.',
    );
    for (const label of ['Como funciona', 'Preços', 'Conectar sua IA', 'Termos de uso', 'Política de Privacidade'])
      expect(footer, label).toContain(label);
    for (const absent of ['OpenAPI', 'Guia para advogados', 'Consulta processual gratuita', 'API para desenvolvedores'])
      expect(footer, absent).not.toContain(absent);
  });

  it('não repete id na mesma página', () => {
    for (const page of ['home', 'how', 'credits'] as const) {
      const ids = [...render(page).matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(ids).size, `${page}: ${ids.join(', ')}`).toBe(ids.length);
    }
  });

  it('com o modelo desligado, tudo fica como está', () => {
    const current = render('home', false);
    expect(current).toContain('Jurisprudência dos tribunais superiores e consulta processual.');
    expect(current).not.toContain(title);
    expect(renderToStaticMarkup(createElement(PublicSite, { page: 'home' }))).toBe(current);
    for (const page of ['product', 'how', 'integrations', 'credits', 'guide', 'api_docs'] as const)
      expect(render(page, false)).not.toContain('Mesa de trabalho');
  });
});

describe('metadados no modelo novo (V5A)', () => {
  it('cada página pública muda com o texto, menos a consulta gratuita e a não encontrada', () => {
    expect(metadataFor('home', true).title).toBe(
      'ForgeLex · Peças jurídicas prontas para revisar, com a jurisprudência na fonte',
    );
    expect(metadataFor('home', true).description).toContain('Mesa de trabalho');
    expect(metadataFor('home', true).description).toContain('no ChatGPT ou no Claude por MCP');
    expect(metadataFor('home', true).path).toBe('/');
    for (const page of ['how', 'credits'] as const) {
      expect(metadataFor(page, true).description, page).not.toBe(metadataFor(page, false).description);
      expect(metadataFor(page, true).path, page).toBe(metadataFor(page, false).path);
    }
    for (const page of ['datajud', 'not_found'] as const)
      expect(metadataFor(page, true)).toEqual(metadataFor(page, false));
  });

  it('com o modelo desligado a página inicial segue com o metadado atual', () => {
    expect(metadataFor('home').title).toBe('ForgeLex · Jurisprudência e consulta processual');
  });

  it('o metadado novo não repete o título rejeitado nem promete o que não está no ar', () => {
    for (const page of ['home', 'product', 'how', 'integrations', 'credits', 'guide', 'api_docs'] as const) {
      const { title, description } = metadataFor(page, true);
      for (const value of [title, description]) {
        expect(value).not.toContain('pensa antes de peticionar');
        for (const absent of ['OCR', 'Word', 'agentes', 'Gemini', 'vigência'])
          expect(value, page).not.toContain(absent);
      }
    }
  });
});
