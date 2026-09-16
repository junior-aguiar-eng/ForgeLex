import { describe, it, expect } from 'vitest';
import { generateDedupeKey, generateContentHash, JurisprudenceDocumentSchema } from './contracts/jurisprudence-document.js';

describe('Legal Data Plane Contracts', () => {
  it('deve gerar dedupe_key estável e determinística normalizando caracteres especiais', () => {
    const key1 = generateDedupeKey('STJ', 'REsp 1.823.450/SP', '2023-04-18');
    const key2 = generateDedupeKey('stj ', 'resp-1823450-sp', '20230418');

    expect(key1).toBe('stj_resp1823450sp_20230418');
    expect(key2).toBe('stj_resp1823450sp_20230418');
    expect(key1).toBe(key2);
  });

  it('deve gerar content_hash SHA-256 consistente de 64 caracteres', () => {
    const text = 'Ementa do acórdão de responsabilidade civil';
    const hash1 = generateContentHash(text);
    const hash2 = generateContentHash(text);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('deve validar um JurisprudenceDocument válido contra o schema', () => {
    const doc = {
      id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      court: 'STJ',
      processNumber: 'REsp 1.823.450',
      rapporteur: 'Min. Nancy Andrighi',
      judgmentDate: '2023-04-18',
      publicationDate: '2023-04-24',
      syllabus: 'Ementa detalhada de responsabilidade civil em proteção de dados pessoais.',
      dedupeKey: 'stj_resp1823450_20230418',
      firstSeenAt: '2026-09-16T00:00:00.000Z',
      lastSeenAt: '2026-09-16T00:00:00.000Z',
      snapshot: {
        contentHash: generateContentHash('conteudo'),
        capturedAt: '2026-09-16T00:00:00.000Z',
        provider: 'STJ_OFICIAL',
      },
      provenance: {
        id: 'e2b3c4d5-6a7b-8c9d-0e1f-2a3b4c5d6e7f',
        source: {
          provider: 'STJ_OFICIAL',
          documentId: '1823450',
        },
        verified: true,
        verificationMethod: 'OFFICIAL_SOURCE_HASH',
        verifiedAt: '2026-09-16T00:00:00.000Z',
        snippet: 'Ementa detalhada',
        confidence: 1.0,
      },
    };

    const parseResult = JurisprudenceDocumentSchema.safeParse(doc);
    expect(parseResult.success).toBe(true);
  });
});
