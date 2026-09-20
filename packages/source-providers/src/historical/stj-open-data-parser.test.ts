import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  parseStjOpenDataRecord,
  parseStjOpenDataJsonRecords,
  parseStjOpenDataZip,
  type StjOpenDataResourceContext,
} from './stj-open-data-parser.js';

const context: StjOpenDataResourceContext = {
  datasetId: 'espelhos-de-acordaos-corte-especial',
  datasetTitle: 'Espelhos de acórdãos da Corte Especial',
  resourceId: 'resource-20220508',
  resourceName: '20220508.json',
  resourceUrl: 'https://dadosabertos.web.stj.jus.br/dataset/example/resource/resource-20220508',
  resourceRole: 'INCREMENTAL',
  extractionDate: '2022-05-08',
};

function officialRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'stj-record-113',
    numeroProcesso: 113,
    numeroRegistro: '202201234567',
    siglaClasse: 'CC',
    nomeOrgaoJulgador: 'CORTE ESPECIAL',
    ministroRelator: 'MINISTRO HUMBERTO MARTINS',
    dataDecisao: '20220508',
    dataPublicacao: 'DJE        DATA:26/05/2022',
    ementa: '  CONFLITO DE COMPETÊNCIA.\n  Ementa oficial com espaços irregulares.  ',
    ...overrides,
  };
}

describe('STJ Open Data parser', () => {
  it('mapeia os nomes reais do STJ, aceita número de processo curto e preserva a proveniência do recurso', () => {
    const document = parseStjOpenDataRecord(officialRecord(), context, '2026-09-19T00:00:00.000Z');

    expect(document.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(document.court).toBe('STJ');
    expect(document.processNumber).toBe('113');
    expect(document.processClass).toBe('CC');
    expect(document.chamber).toBe('CORTE ESPECIAL');
    expect(document.rapporteur).toBe('MINISTRO HUMBERTO MARTINS');
    expect(document.judgmentDate).toBe('2022-05-08');
    expect(document.publicationDate).toBe('2022-05-26');
    expect(document.syllabus).toBe('CONFLITO DE COMPETÊNCIA. Ementa oficial com espaços irregulares.');
    expect(document.dedupeKey).toBe('stj_open_data_stj-record-113');
    expect(document.officialUrl).toBe('https://processo.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202201234567');
    expect(document.fullText).toBeUndefined();
    expect(document.provenance.source.documentId).toBe('stj-record-113');
    expect(document.provenance.source.sourceUrl).toBe(context.resourceUrl);
    expect(document.provenance.verificationMethod).toBe('OFFICIAL_SOURCE_HASH');
  });

  it('rejeita registro sem campo obrigatório, sem inventar valor de fallback', () => {
    expect(() => parseStjOpenDataRecord(officialRecord({ ementa: '' }), context)).toThrow('STJ_OPEN_DATA_RECORD_INVALID');
    expect(() => parseStjOpenDataRecord(officialRecord({ id: undefined }), context)).toThrow('STJ_OPEN_DATA_RECORD_INVALID');
  });

  it('lê todos os JSON internos de um ZIP cross-platform e ignora arquivos não classificáveis', () => {
    const zip = zipSync({
      '20051231.json': strToU8(JSON.stringify([officialRecord({ id: 'historical-1' })])),
      '20220508.json': strToU8(JSON.stringify([officialRecord({ id: 'incremental-1' })])),
      'Dicionario_de_Dados.pdf': strToU8('dictionary'),
    });

    const entries = parseStjOpenDataZip(zip);

    expect(entries).toHaveLength(3);
    expect(entries.filter((entry) => entry.classifiable)).toHaveLength(2);
    expect(entries.filter((entry) => entry.classifiable).flatMap((entry) => entry.records)).toHaveLength(2);
    expect(entries.find((entry) => entry.name === 'Dicionario_de_Dados.pdf')?.classifiable).toBe(false);
  });

  it('itera registros JSON oficiais sem materializar o array completo', () => {
    const records = [...parseStjOpenDataJsonRecords(
      '20220508.json',
      new TextEncoder().encode(JSON.stringify([
        officialRecord({ id: 'stream-1' }),
        officialRecord({ id: 'stream-2' }),
      ])),
    )];

    expect(records).toHaveLength(2);
    expect((records[0] as Record<string, unknown>).id).toBe('stream-1');
    expect((records[1] as Record<string, unknown>).id).toBe('stream-2');
  });
});
