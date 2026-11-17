import { describe, expect, it } from 'vitest';
import {
  OCR_MAX_IMAGE_BYTES,
  OCR_MAX_PAGES,
  OcrError,
  fitWithin,
  isImageFile,
  isPdfFile,
  recognizeFile,
  type OcrEngine,
  type OcrProgress,
  type PdfPageSource,
} from './ocr-document';

const file = (name: string, size = 10, type = '') => new File([new Uint8Array(size)], name, { type });

/** Motor falso: devolve o texto combinado com o que "viu" e registra o uso. */
function fakeEngine(texts: string[], options: { confidence?: number; fail?: Error; onRecognize?: () => void } = {}) {
  const calls: unknown[] = [];
  let terminated = 0;
  let index = 0;
  const engine: OcrEngine = {
    async recognize(image) {
      calls.push(image);
      options.onRecognize?.();
      if (options.fail) throw options.fail;
      const text = texts[index++] ?? '';
      return { text, confidence: options.confidence ?? 90 };
    },
    async terminate() {
      terminated++;
    },
  };
  return { engine, calls, terminated: () => terminated };
}

function fakePdf(pages: number, rendered: number[] = []): PdfPageSource {
  return {
    pageCount: pages,
    async renderPage(number) {
      rendered.push(number);
      return { canvas: `pagina-${number}` } as never;
    },
    async destroy() {},
  };
}

describe('detecção de tipo', () => {
  it('reconhece PDF e imagens por nome ou tipo MIME', () => {
    expect(isPdfFile(file('a.PDF'))).toBe(true);
    expect(isPdfFile(file('sem-extensao', 1, 'application/pdf'))).toBe(true);
    expect(isPdfFile(file('a.png'))).toBe(false);
    for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.webp', 'a.gif', 'a.tif', 'a.tiff', 'a.bmp'])
      expect(isImageFile(file(name))).toBe(true);
    expect(isImageFile(file('sem-extensao', 1, 'image/png'))).toBe(true);
    expect(isImageFile(file('a.pdf'))).toBe(false);
    expect(isImageFile(file('a.docx'))).toBe(false);
  });
});

describe('fitWithin', () => {
  it('mantém o tamanho quando cabe e reduz proporcionalmente quando passa do limite', () => {
    expect(fitWithin(1000, 500, 4000)).toEqual({ width: 1000, height: 500 });
    expect(fitWithin(8000, 4000, 4000)).toEqual({ width: 4000, height: 2000 });
    expect(fitWithin(3000, 6000, 4000)).toEqual({ width: 2000, height: 4000 });
  });

  it('nunca devolve dimensão zero', () => {
    expect(fitWithin(10000, 1, 4000)).toEqual({ width: 4000, height: 1 });
  });
});

describe('recognizeFile: PDF', () => {
  it('reconhece as páginas em ordem, junta com linha em branco e encerra o motor', async () => {
    const { engine, calls, terminated } = fakeEngine(['Primeira página', 'Segunda página', 'Terceira']);
    const progress: OcrProgress[] = [];

    const result = await recognizeFile(file('escaneado.pdf'), {
      onProgress: (value) => progress.push(value),
      createEngine: async () => engine,
      openPdf: async () => fakePdf(3),
    });

    expect(result.text).toBe('Primeira página\n\nSegunda página\n\nTerceira');
    expect(result.pages).toBe(3);
    expect(result.confidence).toBe(90);
    expect(calls).toHaveLength(3);
    expect(terminated()).toBe(1);
    // O progresso nunca anda para trás e termina em 100%.
    const fractions = progress.map((value) => value.fraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
    expect(fractions.at(-1)).toBe(1);
    expect(progress.some((value) => value.page === 2 && value.pages === 3)).toBe(true);
  });

  it('recusa um PDF com páginas demais antes de gastar qualquer tempo de OCR', async () => {
    const { engine, calls, terminated } = fakeEngine([]);
    let engineCreated = false;

    await expect(
      recognizeFile(file('grande.pdf'), {
        createEngine: async () => {
          engineCreated = true;
          return engine;
        },
        openPdf: async () => fakePdf(OCR_MAX_PAGES + 1),
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_PAGES' });

    expect(engineCreated).toBe(false);
    expect(calls).toHaveLength(0);
    expect(terminated()).toBe(0);
  });

  it('a mensagem do limite diz quantas páginas tem o arquivo e quantas o OCR aceita', async () => {
    const error = await recognizeFile(file('grande.pdf'), {
      createEngine: async () => fakeEngine([]).engine,
      openPdf: async () => fakePdf(OCR_MAX_PAGES + 5),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OcrError);
    expect((error as OcrError).message).toContain(String(OCR_MAX_PAGES + 5));
    expect((error as OcrError).message).toContain(String(OCR_MAX_PAGES));
  });

  it('cancelar no meio para de reconhecer, encerra o motor e libera o PDF', async () => {
    const controller = new AbortController();
    const { engine, calls, terminated } = fakeEngine(['a', 'b', 'c', 'd'], {
      onRecognize: () => {
        if (calls.length === 2) controller.abort();
      },
    });
    const rendered: number[] = [];
    const pdf = fakePdf(4, rendered);
    let destroyed = false;
    pdf.destroy = async () => {
      destroyed = true;
    };

    await expect(
      recognizeFile(file('escaneado.pdf'), {
        signal: controller.signal,
        createEngine: async () => engine,
        openPdf: async () => pdf,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(calls.length).toBeLessThan(4);
    expect(terminated()).toBe(1);
    expect(destroyed).toBe(true);
    // Renderizar uma página é caro: depois do cancelamento nenhuma outra é desenhada.
    expect(rendered).toEqual([1, 2]);
  });

  it('cancelar durante uma página longa encerra o motor na hora, sem esperar a página terminar', async () => {
    const controller = new AbortController();
    let rejectPending: (error: Error) => void = () => undefined;
    let terminated = 0;
    const engine: OcrEngine = {
      recognize: () =>
        new Promise((_, reject) => {
          rejectPending = reject;
          queueMicrotask(() => controller.abort());
        }),
      async terminate() {
        terminated++;
        rejectPending(new Error('motor encerrado'));
      },
    };

    await expect(
      recognizeFile(file('longa.pdf'), {
        signal: controller.signal,
        createEngine: async () => engine,
        openPdf: async () => fakePdf(1),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminated).toBe(1);
  }, 1500);

  it('o progresso nunca anda para trás, mesmo que o motor avise fora de ordem', async () => {
    const progress: OcrProgress[] = [];
    const engine: OcrEngine = {
      async recognize(_image, onFraction) {
        for (const fraction of [0.2, 0.8, 0.3, 0.5, 1]) onFraction?.(fraction);
        return { text: 'texto', confidence: 90 };
      },
      async terminate() {},
    };

    await recognizeFile(file('a.pdf'), {
      onProgress: (value) => progress.push(value),
      createEngine: async () => engine,
      openPdf: async () => fakePdf(2),
    });

    const fractions = progress.map((value) => value.fraction);
    for (let index = 1; index < fractions.length; index++) {
      expect(fractions[index]!).toBeGreaterThanOrEqual(fractions[index - 1]!);
    }
  });

  it('um sinal já cancelado nem abre o arquivo', async () => {
    const controller = new AbortController();
    controller.abort();
    let opened = false;

    await expect(
      recognizeFile(file('a.pdf'), {
        signal: controller.signal,
        createEngine: async () => fakeEngine([]).engine,
        openPdf: async () => {
          opened = true;
          return fakePdf(1);
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(opened).toBe(false);
  });

  it('falha do motor vira erro legível e o motor é encerrado mesmo assim', async () => {
    const { engine, terminated } = fakeEngine([], { fail: new Error('wasm quebrou: detalhe interno') });

    const error = await recognizeFile(file('a.pdf'), {
      createEngine: async () => engine,
      openPdf: async () => fakePdf(1),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OcrError);
    expect((error as OcrError).code).toBe('ENGINE_FAILED');
    // Detalhes internos do motor não vão para a tela.
    expect((error as OcrError).message).not.toContain('wasm quebrou');
    expect(terminated()).toBe(1);
  });

  it('falha ao abrir o motor (arquivos de OCR indisponíveis) tem mensagem própria', async () => {
    const error = await recognizeFile(file('a.pdf'), {
      createEngine: async () => {
        throw new Error('Failed to fetch');
      },
      openPdf: async () => fakePdf(1),
    }).catch((e: unknown) => e);

    expect((error as OcrError).code).toBe('ENGINE_UNAVAILABLE');
  });

  it('devolve texto vazio, sem erro, quando nada foi reconhecido (a tela decide o que dizer)', async () => {
    const result = await recognizeFile(file('em-branco.pdf'), {
      createEngine: async () => fakeEngine(['  ', '\n']).engine,
      openPdf: async () => fakePdf(2),
    });

    expect(result.text).toBe('');
  });

  it('normaliza quebras de linha e espaços nas pontas de cada página', async () => {
    const result = await recognizeFile(file('a.pdf'), {
      createEngine: async () => fakeEngine(['  Linha 1\r\nLinha 2  \n\n', '\nOutra\r\n']).engine,
      openPdf: async () => fakePdf(2),
    });

    expect(result.text).toBe('Linha 1\nLinha 2\n\nOutra');
  });

  it('a confiança do resultado é a média das páginas com texto', async () => {
    let page = 0;
    const engine: OcrEngine = {
      async recognize() {
        page++;
        return page === 1 ? { text: 'um', confidence: 80 } : { text: 'dois', confidence: 60 };
      },
      async terminate() {},
    };

    const result = await recognizeFile(file('a.pdf'), {
      createEngine: async () => engine,
      openPdf: async () => fakePdf(2),
    });

    expect(result.confidence).toBe(70);
  });
});

describe('recognizeFile: imagem', () => {
  it('reconhece uma única imagem', async () => {
    const { engine, calls, terminated } = fakeEngine(['Texto da imagem']);

    const result = await recognizeFile(file('foto.png', 100, 'image/png'), {
      createEngine: async () => engine,
      loadImage: async () => ({ canvas: 'imagem' }) as never,
    });

    expect(result).toMatchObject({ text: 'Texto da imagem', pages: 1 });
    expect(calls).toHaveLength(1);
    expect(terminated()).toBe(1);
  });

  it('recusa imagem acima do limite de tamanho, sem abri-la', async () => {
    let loaded = false;

    await expect(
      recognizeFile(file('enorme.png', OCR_MAX_IMAGE_BYTES + 1, 'image/png'), {
        createEngine: async () => fakeEngine([]).engine,
        loadImage: async () => {
          loaded = true;
          return {} as never;
        },
      }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(loaded).toBe(false);
  });

  it('recusa tipo de arquivo que não é PDF nem imagem', async () => {
    await expect(
      recognizeFile(file('texto.txt'), { createEngine: async () => fakeEngine([]).engine }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});
