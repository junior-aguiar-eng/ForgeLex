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

// V5A: o modelo novo (título aprovado por Boni em 17/11/2026) vem atrás de `VITE_FORGELEX_PUBLIC_MODEL`, desligado por
// padrão. Cada frase abaixo corresponde a uma função publicada; o que ainda não está no ar não entra.
describe('site público no modelo novo (V5A)', () => {
  const title = 'Sua IA, com jurisprudência que dá para conferir.';
  const subtitle =
    'Conecte o ForgeLex ao ChatGPT ou ao Claude por MCP e pesquise decisões com a fonte e o estado de verificação de cada resultado. Você paga só pelo uso.';
  const html = renderToStaticMarkup(createElement(PublicSite, { page: 'home', model: true }));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('traz o título e o subtítulo aprovados, em um só h1, e mantém o veto ao título rejeitado', () => {
    expect(html).toContain(title);
    expect(text).toContain(subtitle);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).not.toContain('A inteligência jurídica que pensa antes de peticionar.');
  });

  it('com o modelo desligado, o título e o texto atuais ficam como estão', () => {
    const current = renderToStaticMarkup(createElement(PublicSite, { page: 'home', model: false }));
    expect(current).toContain('Jurisprudência dos tribunais superiores e consulta processual.');
    expect(current).not.toContain(title);
    expect(renderToStaticMarkup(createElement(PublicSite, { page: 'home' }))).toBe(current);
  });

  it('apresenta a Mesa com o que está no ar e nada além', () => {
    expect(text).toContain('Mesa de trabalho');
    expect(text).toContain('PDF, texto ou Markdown');
    // Word, OCR, agentes analíticos e Gemini ainda não estão publicados ou ensaiados: não entram no texto.
    for (const absent of ['OCR', 'Word', '.docx', 'agentes analíticos', 'Gemini', 'vigência'])
      expect(text, absent).not.toContain(absent);
  });

  it('não diz mais que o suspenso fluxo de casos e rascunhos e não oferece módulos congelados', () => {
    expect(text).not.toContain('está suspenso');
    for (const destination of ['/app/casos', '/app/rascunhos', '/app/revisao'])
      expect(html).not.toContain(`href="${destination}"`);
    for (const offer of ['Casos e evidências', 'Rascunhos e revisão', 'Estratégia e documentos', 'Do caso à minuta'])
      expect(html).not.toContain(offer);
  });

  it('conserva os destinos públicos e as âncoras que outras páginas usam', () => {
    for (const destination of ['/cadastro', '/produto', '/integracoes', '/desenvolvedores/api', '/consulta-processual'])
      expect(html).toContain(`href="${destination}"`);
    for (const anchor of ['pesquisa', 'integracao', 'conta', 'api', 'casos', 'rascunhos', 'revisao', 'perguntas'])
      expect(html).toContain(`id="${anchor}"`);
    expect(html).not.toContain('href="#"');
  });

  it('a pergunta sobre a cobrança continua dizendo que a pesquisa válida é faturável e que verificar é gratuito', () => {
    expect(text).toContain('Uma nova pesquisa válida é faturável');
    expect(text).toContain('verificar sua proveniência são gratuitos');
  });
});

describe('metadados no modelo novo (V5A)', () => {
  it('só a página inicial muda, até as outras ganharem o texto novo', () => {
    expect(metadataFor('home', true).title).toBe('ForgeLex · Sua IA, com jurisprudência que dá para conferir');
    expect(metadataFor('home', true).description).toContain('ChatGPT ou ao Claude por MCP');
    expect(metadataFor('home', true).path).toBe('/');
    for (const page of ['product', 'how', 'integrations', 'credits', 'guide', 'api_docs', 'datajud'] as const)
      expect(metadataFor(page, true)).toEqual(metadataFor(page, false));
  });

  it('com o modelo desligado a página inicial segue com o metadado atual', () => {
    expect(metadataFor('home').title).toBe('ForgeLex · Jurisprudência e consulta processual');
  });

  it('o metadado novo não repete o título rejeitado nem promete o que não está no ar', () => {
    const { title, description } = metadataFor('home', true);
    for (const value of [title, description]) {
      expect(value).not.toContain('pensa antes de peticionar');
      for (const absent of ['OCR', 'Word', 'agentes', 'Gemini', 'vigência']) expect(value).not.toContain(absent);
    }
  });
});
