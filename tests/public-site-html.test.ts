import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OG_IMAGE_GELO_PATH,
  OG_IMAGE_PATH,
  modelSitemap,
  transformPublicIndexHtml,
  transformPublicText,
} from '../apps/web/public-site-html-plugin';
import { DEFAULT_PUBLIC_ORIGIN, metadata, modelMetadata } from '../apps/web/src/public/public-metadata-data';

const html = readFileSync('apps/web/index.html', 'utf8');
const model = modelMetadata.home!;

describe('index.html montado no build (V5A, parte 3)', () => {
  it('sem o modelo e sem outro domínio, sai exatamente como está no repositório', () => {
    expect(transformPublicIndexHtml(html, { model: false })).toBe(html);
    expect(transformPublicIndexHtml(html, { model: false, origin: DEFAULT_PUBLIC_ORIGIN + '/' })).toBe(html);
  });

  it('no modelo novo, o título e a descrição da inicial saem iguais aos do código, em todas as marcas', () => {
    const out = transformPublicIndexHtml(html, { model: true });
    expect(out).toContain(`<title>${model.title}</title>`);
    expect(out).toContain(`<meta property="og:title" content="${model.title}" />`);
    expect(out).toContain(`<meta name="twitter:title" content="${model.title}" />`);
    expect(out.split(model.description).length - 1).toBe(3);
    expect(out).not.toContain(metadata.home.title);
    expect(out).not.toContain(metadata.home.description);
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('no modelo novo, a imagem de prévia entra com endereço absoluto e texto alternativo', () => {
    const out = transformPublicIndexHtml(html, { model: true });
    expect(out).toContain(`<meta property="og:image" content="${DEFAULT_PUBLIC_ORIGIN}${OG_IMAGE_PATH}" />`);
    expect(out).toContain('property="og:image:alt"');
    expect(out).toContain(`<meta name="twitter:image" content="${DEFAULT_PUBLIC_ORIGIN}${OG_IMAGE_PATH}" />`);
    expect(transformPublicIndexHtml(html, { model: false })).not.toContain('og:image');
  });

  it.each([OG_IMAGE_PATH, OG_IMAGE_GELO_PATH])('a imagem %s existe, é PNG 1200 por 630 e é leve', (path) => {
    const file = `apps/web/public${path}`;
    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(statSync(file).size).toBeLessThan(300_000);
  });

  it('a imagem de prévia segue o tema do build: gelo usa a azul-petróleo, o resto a original', () => {
    const image = (theme?: string) =>
      /og:image" content="([^"]+)"/.exec(transformPublicIndexHtml(html, { model: true, theme }))?.[1];
    expect(image('gelo')).toBe(`${DEFAULT_PUBLIC_ORIGIN}${OG_IMAGE_GELO_PATH}`);
    for (const theme of [undefined, 'classico', 'previa', 'Gelo'])
      expect(image(theme)).toBe(`${DEFAULT_PUBLIC_ORIGIN}${OG_IMAGE_PATH}`);
    // Sem o modelo novo não há imagem, qualquer que seja o tema.
    expect(transformPublicIndexHtml(html, { model: false, theme: 'gelo' })).toBe(html);
  });

  it('VITE_PUBLIC_ORIGIN troca o domínio em canonical, og:url e imagem, sem sobrar o antigo', () => {
    const out = transformPublicIndexHtml(html, { model: true, origin: 'https://exemplo.com.br/' });
    expect(out).toContain('<link rel="canonical" href="https://exemplo.com.br/" />');
    expect(out).toContain('<meta property="og:url" content="https://exemplo.com.br/" />');
    expect(out).toContain('content="https://exemplo.com.br/og/forgelex-modelo.png"');
    expect(out).not.toContain('nexojuris');
  });

  it('o sitemap e o robots seguem o mesmo domínio', () => {
    const sitemap = readFileSync('apps/web/public/sitemap.xml', 'utf8');
    const robots = readFileSync('apps/web/public/robots.txt', 'utf8');
    expect(transformPublicText(sitemap)).toBe(sitemap);
    expect(transformPublicText(sitemap, 'https://exemplo.com.br')).not.toContain('nexojuris');
    expect(transformPublicText(sitemap, 'https://exemplo.com.br')).toContain(
      '<loc>https://exemplo.com.br/produto</loc>',
    );
    expect(transformPublicText(robots, 'https://exemplo.com.br')).toContain(
      'Sitemap: https://exemplo.com.br/sitemap.xml',
    );
  });

  it('falha alto se o index.html perder o texto que o plugin troca', () => {
    expect(() => transformPublicIndexHtml('<title>outro</title>', { model: true })).toThrow(
      /não contém o texto esperado/,
    );
  });
});

describe('sitemap no modelo novo (27/11)', () => {
  it('lista só Início, Como funciona e Preços; sem o modelo o arquivo fica igual', () => {
    const sitemap = readFileSync('apps/web/public/sitemap.xml', 'utf8');
    const model = modelSitemap(sitemap);
    for (const kept of ['/</loc>', '/como-funciona</loc>', '/creditos</loc>']) expect(model).toContain(kept);
    for (const removed of ['/produto<', '/integracoes<', '/guia<', '/consulta-processual<', '/desenvolvedores/api<'])
      expect(model).not.toContain(removed);
    expect(model).toMatch(/^<\?xml/);
    expect(model.trim().endsWith('</urlset>')).toBe(true);
  });
});
