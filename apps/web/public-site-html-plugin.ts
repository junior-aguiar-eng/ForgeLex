import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { DEFAULT_PUBLIC_ORIGIN, metadata, modelMetadata } from './src/public/public-metadata-data';

/**
 * Monta, no build, o que os robôs de busca e as prévias de link leem sem executar JavaScript: o `index.html`, o
 * `sitemap.xml` e o `robots.txt`. Duas coisas mudam, e só quando pedidas:
 *
 * - `VITE_FORGELEX_PUBLIC_MODEL=true` troca o título e a descrição da página inicial pelos do modelo novo (V5A), as
 *   mesmas strings de `public-metadata-data.ts`, e acrescenta a imagem de prévia (`og:image`) com o título novo;
 * - `VITE_PUBLIC_ORIGIN` troca o domínio (D3, virada de domínio); sem ela vale o domínio atual.
 *
 * Sem nenhuma das duas, o `index.html` sai exatamente como está no repositório.
 */
export const OG_IMAGE_PATH = '/og/forgelex-modelo.png';
export const OG_IMAGE_ALT = 'ForgeLex: Sua IA, com jurisprudência que dá para conferir.';

export interface PublicSiteOptions {
  model: boolean;
  origin?: string;
}

const normalizeOrigin = (origin?: string) => (origin?.trim() || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');

export function transformPublicIndexHtml(html: string, { model, origin }: PublicSiteOptions): string {
  const target = normalizeOrigin(origin);
  let out = html;
  if (model) {
    const classic = metadata.home;
    const next = modelMetadata.home;
    if (!next) throw new Error('Metadado do modelo novo ausente para a página inicial.');
    for (const [from, to] of [
      [classic.title, next.title],
      [classic.description, next.description],
    ] as const) {
      if (!out.includes(from)) throw new Error(`index.html não contém o texto esperado: ${from}`);
      out = out.split(from).join(to);
    }
    const image = `${target}${OG_IMAGE_PATH}`;
    const tags = [
      `    <meta property="og:image" content="${image}" />`,
      `    <meta property="og:image:alt" content="${OG_IMAGE_ALT}" />`,
      `    <meta name="twitter:image" content="${image}" />`,
    ].join('\n');
    out = out.replace(
      '<meta name="twitter:card" content="summary" />',
      `${tags}\n    <meta name="twitter:card" content="summary_large_image" />`,
    );
    if (!out.includes('og:image')) throw new Error('index.html sem o marcador do twitter:card.');
  }
  return target === DEFAULT_PUBLIC_ORIGIN ? out : out.split(DEFAULT_PUBLIC_ORIGIN).join(target);
}

export function transformPublicText(text: string, origin?: string): string {
  const target = normalizeOrigin(origin);
  return target === DEFAULT_PUBLIC_ORIGIN ? text : text.split(DEFAULT_PUBLIC_ORIGIN).join(target);
}

export function publicSitePlugin(options: PublicSiteOptions): Plugin {
  let outDir = 'dist';
  return {
    name: 'forgelex-public-site',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) => transformPublicIndexHtml(html, options),
    // `public/` é copiado como está; com outro domínio, o sitemap e o robots precisam apontar para ele.
    closeBundle() {
      if (normalizeOrigin(options.origin) === DEFAULT_PUBLIC_ORIGIN) return;
      for (const file of ['sitemap.xml', 'robots.txt']) {
        const path = join(outDir, file);
        if (existsSync(path)) writeFileSync(path, transformPublicText(readFileSync(path, 'utf8'), options.origin));
      }
    },
  };
}
