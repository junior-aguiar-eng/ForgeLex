import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Serve, da nossa própria origem, os arquivos que o OCR no navegador (Tesseract.js) precisa: o worker, o núcleo
 * WebAssembly e o idioma português. Por padrão a biblioteca os busca num CDN de terceiros; aqui nada sai da origem.
 * Em desenvolvimento, um middleware lê de `node_modules`; no build, os mesmos arquivos viram ativos sem hash em `ocr/`.
 */
const require = createRequire(import.meta.url);
const packageDir = (name: string, from?: string) =>
  dirname(require.resolve(`${name}/package.json`, from ? { paths: [from] } : undefined));

export interface OcrAsset {
  /** Caminho público, sempre sob `/ocr/`. */
  url: string;
  file: string;
  type: string;
}

export function ocrAssets(): OcrAsset[] {
  const tesseract = packageDir('tesseract.js');
  // O núcleo é dependência do tesseract.js, não do app: resolve a partir dele.
  const core = packageDir('tesseract.js-core', tesseract);
  const language = packageDir('@tesseract.js-data/por');
  const js = 'text/javascript; charset=utf-8';
  // Só as variantes LSTM (o motor moderno): a biblioteca escolhe entre elas pelo suporte a SIMD do navegador.
  const cores = ['tesseract-core-relaxedsimd-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-lstm'];
  return [
    { url: '/ocr/worker.min.js', file: join(tesseract, 'dist', 'worker.min.js'), type: js },
    ...cores.map((name) => ({ url: `/ocr/core/${name}.wasm.js`, file: join(core, `${name}.wasm.js`), type: js })),
    {
      url: '/ocr/lang/por.traineddata.gz',
      file: join(language, '4.0.0_best_int', 'por.traineddata.gz'),
      type: 'application/gzip',
    },
  ];
}

/** Avisos que acompanham os arquivos servidos: o texto da Apache-2.0 do código e a origem dos dados de idioma. */
function notice(): string {
  const tesseract = packageDir('tesseract.js');
  const core = packageDir('tesseract.js-core', tesseract);
  const licensed = (title: string, path: string) => `=== ${title} ===\n${readFileSync(path, 'utf8').trim()}\n`;
  return [
    licensed('tesseract.js 7.0.0 (Apache-2.0)', join(tesseract, 'LICENSE.md')),
    licensed('tesseract.js-core 7.0.0 (Apache-2.0; inclui o Tesseract e o Leptonica)', join(core, 'LICENSE')),
    '=== ocr/lang/por.traineddata.gz ===\n' +
      'Dados de idioma português (arquivo 4.0.0_best_int) distribuídos pelo pacote npm @tesseract.js-data/por 1.0.0, ' +
      'licença MIT do pacote, repositório github.com/naptha/tessdata. Os modelos de origem são do projeto Tesseract ' +
      '(Apache-2.0).\n',
  ].join('\n');
}

export function ocrAssetsPlugin(): Plugin {
  return {
    name: 'forgelex-ocr-assets',
    configureServer(server) {
      const byUrl = new Map(ocrAssets().map((asset) => [asset.url, asset]));
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?', 1)[0] ?? '';
        if (url === '/ocr/NOTICE.txt') {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(notice());
          return;
        }
        const asset = byUrl.get(url);
        if (!asset) return next();
        response.setHeader('Content-Type', asset.type);
        response.setHeader('Cache-Control', 'no-cache');
        response.end(readFileSync(asset.file));
      });
    },
    generateBundle() {
      for (const asset of ocrAssets()) {
        this.emitFile({ type: 'asset', fileName: asset.url.slice(1), source: readFileSync(asset.file) });
      }
      this.emitFile({ type: 'asset', fileName: 'ocr/NOTICE.txt', source: notice() });
    },
  };
}
