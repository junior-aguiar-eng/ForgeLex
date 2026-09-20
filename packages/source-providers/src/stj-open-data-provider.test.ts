import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { StjOpenDataProvider } from './providers/stj-open-data-provider.js';
import type { StjHistoricalCoveragePlan, StjHistoricalResource } from './historical/stj-open-data-catalog.js';

const resource: StjHistoricalResource = {
  datasetId: 'dataset-1',
  datasetTitle: 'Dataset STJ',
  resourceId: 'resource-1',
  name: '20220508.zip',
  format: 'ZIP',
  url: 'https://dados.example/resource-1',
  extractionDate: '2022-05-08',
  role: 'HISTORICAL_SNAPSHOT',
};

function record(id: string, syllabus = 'Ementa oficial suficientemente longa para o teste.') {
  return {
    id,
    numeroProcesso: '113',
    numeroRegistro: '202201234567',
    siglaClasse: 'CC',
    nomeOrgaoJulgador: 'CORTE ESPECIAL',
    ministroRelator: 'MINISTRO HUMBERTO MARTINS',
    dataDecisao: '20220508',
    dataPublicacao: 'DJE DATA:26/05/2022',
    ementa: syllabus,
  };
}

function plan(resources: StjHistoricalResource[]): StjHistoricalCoveragePlan {
  return { datasets: ['dataset-1'], resources, unclassifiedResources: [], unclassifiedResourceDetails: [], warnings: [] };
}

describe('StjOpenDataProvider', () => {
  it('repete download transitório antes de interpretar o recurso oficial', async () => {
    const bytes = zipSync({
      '20220508.json': strToU8(JSON.stringify([record('official-retry')])),
    });
    let attempts = 0;
    const provider = new StjOpenDataProvider({
      catalog: { discover: async () => plan([resource]) },
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('terminated');
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
      },
    });

    const result = await provider.loadResource(resource);

    expect(attempts).toBe(2);
    expect(result.acceptedRecordCount).toBe(1);
  });

  it('baixa e reconcilia um ZIP oficial, contabiliza rejeitados e deduplica por id oficial', async () => {
    const bytes = zipSync({
      '20051231.json': strToU8(JSON.stringify([
        record('official-1'),
        record('official-1'),
        record('invalid', 'curto'),
      ])),
      'Dicionario.txt': strToU8('não é corpus'),
    });
    const provider = new StjOpenDataProvider({
      catalog: { discover: async () => plan([resource]) },
      fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }),
    });

    const result = await provider.loadResource(resource);

    expect(result.rawRecordCount).toBe(3);
    expect(result.acceptedRecordCount).toBe(1);
    expect(result.rejectedRecordCount).toBe(1);
    expect(result.duplicateRecordCount).toBe(1);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].provenance.source.documentId).toBe('official-1');
    expect(result.warnings).toContain('Dicionario.txt:NON_JSON_RESOURCE');
  });

  it('falha fechado quando o mesmo id oficial tem conteúdo divergente no mesmo recurso', async () => {
    const bytes = zipSync({
      '20220508.json': strToU8(JSON.stringify([
        record('official-conflict', 'Primeira ementa oficial suficientemente longa.'),
        record('official-conflict', 'Segunda ementa oficial suficientemente longa.'),
      ])),
    });
    const provider = new StjOpenDataProvider({
      catalog: { discover: async () => plan([resource]) },
      fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }),
    });

    await expect(provider.loadResource(resource)).rejects.toThrow('STJ_OPEN_DATA_RESOURCE_CONFLICT');
  });
});
