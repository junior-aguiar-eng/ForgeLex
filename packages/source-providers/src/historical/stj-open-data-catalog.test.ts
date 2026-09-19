import { describe, expect, it } from 'vitest';
import { StjOpenDataCatalog } from './stj-open-data-catalog.js';

describe('catálogo histórico oficial do STJ', () => {
  it('classifica o snapshot histórico e os incrementais por dataset', async () => {
    const catalog = new StjOpenDataCatalog({
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            result: {
              name: 'espelhos-de-acordaos-corte-especial',
              title: 'Espelhos de acórdãos - Corte Especial',
              resources: [
                { id: 'json-2', name: '20230630.json', format: 'JSON', url: 'https://example.test/20230630.json' },
                { id: 'zip-1', name: '20220507.zip', format: 'ZIP', url: 'https://example.test/20220507.zip' },
                { id: 'csv', name: 'dicionario.csv', format: 'CSV', url: 'https://example.test/dicionario.csv' },
              ],
            },
          };
        },
      }),
    });

    const plan = await catalog.discover(['espelhos-de-acordaos-corte-especial']);

    expect(plan.resources).toMatchObject([
      { resourceId: 'zip-1', role: 'HISTORICAL_SNAPSHOT', extractionDate: '2022-05-07' },
      { resourceId: 'json-2', role: 'INCREMENTAL', extractionDate: '2023-06-30' },
    ]);
    expect(plan.unclassifiedResources).toEqual(['dicionario.csv']);
    expect(plan.warnings).toEqual([]);
  });

  it('sinaliza dataset sem snapshot ZIP e recurso sem data enumerável', async () => {
    const catalog = new StjOpenDataCatalog({
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            result: {
              name: 'espelhos-de-acordaos-primeira-secao',
              title: 'Primeira Seção',
              resources: [
                { id: 'json', name: '20260901.json', format: 'JSON', url: 'https://example.test/20260901.json' },
                { id: 'broken', name: 'atual.zip', format: 'ZIP', url: 'https://example.test/atual.zip' },
              ],
            },
          };
        },
      }),
    });

    const plan = await catalog.discover(['espelhos-de-acordaos-primeira-secao']);

    expect(plan.unclassifiedResources).toEqual(['atual.zip']);
    expect(plan.warnings).toContain('HISTORICAL_SNAPSHOT_NOT_ZIP:espelhos-de-acordaos-primeira-secao');
  });
});
