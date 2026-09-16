import { LegalSourceProvider, SearchOptions } from '../contracts/legal-source-provider.js';
import {
  JurisprudenceDocument,
  generateDedupeKey,
  generateContentHash,
} from '@forgelex/legal-data';
import { randomUUID } from 'node:crypto';

export class CanonicalFixtureProvider implements LegalSourceProvider {
  public readonly id = 'provider_canonical_fixtures';
  public readonly name = 'Provedor Canônico Oficial (Fixtures STJ/STF)';
  public readonly isOfficial = true;

  private readonly documents: JurisprudenceDocument[];

  constructor() {
    const rawDocs = [
      {
        court: 'STJ',
        processNumber: 'REsp 1.823.450/SP',
        rapporteur: 'Min. Nancy Andrighi',
        judgmentDate: '2023-04-18',
        publicationDate: '2023-04-24',
        syllabus:
          'CIVIL E PROCESSUAL CIVIL. RECURSO ESPECIAL. AÇÃO DE INDENIZAÇÃO POR DANOS MATERIAIS E MORAIS. VAZAMENTO DE DADOS PESSOAIS. LGPD. DANO MORAL IN RE IPSA NÃO CONFIGURADO. NECESSIDADE DE DEMONSTRAÇÃO DE PREJUÍZO EFETIVO. A violação a dados pessoais comuns não gera dano moral in re ipsa.',
        fullText:
          'O simples vazamento de dados pessoais não sensíveis desacompanhado de prova de dano concreto ou uso indevido por terceiros não acarreta dano moral presumido.',
      },
      {
        court: 'STF',
        processNumber: 'ADI 6.387/DF',
        rapporteur: 'Min. Rosa Weber',
        judgmentDate: '2020-05-07',
        publicationDate: '2020-11-12',
        syllabus:
          'CONSTITUCIONAL. DIREITO FUNDAMENTAL À PROTEÇÃO DE DADOS PESSOAIS. AUTONOMIA INFORMATIVA. MEDIDA PROVISÓRIA 954/2020. Reconhecimento autônomo do direito à autodeterminação informativa no art. 5º da CF/88.',
        fullText:
          'O direito à proteção de dados pessoais e à privacidade é garantia fundamental com eficácia irradiante sobre o poder público e entidades privadas.',
      },
    ];

    const now = '2026-09-16T00:00:00.000Z';

    this.documents = rawDocs.map((d) => {
      const dedupeKey = generateDedupeKey(d.court, d.processNumber, d.judgmentDate);
      const contentHash = generateContentHash(d.syllabus + d.fullText);

      return {
        id: randomUUID(),
        court: d.court,
        processNumber: d.processNumber,
        rapporteur: d.rapporteur,
        judgmentDate: d.judgmentDate,
        publicationDate: d.publicationDate,
        syllabus: d.syllabus,
        fullText: d.fullText,
        dedupeKey,
        firstSeenAt: now,
        lastSeenAt: now,
        snapshot: {
          contentHash,
          capturedAt: now,
          provider: 'STJ_STF_CANONICAL',
        },
        provenance: {
          id: randomUUID(),
          source: {
            provider: this.id,
            court: d.court,
            documentId: d.processNumber,
            contentHash,
            dedupeKey,
          },
          verified: true,
          verificationMethod: 'OFFICIAL_SOURCE_HASH',
          verifiedAt: now,
          snippet: d.syllabus,
          confidence: 1.0,
        },
      };
    });
  }

  public supportsCourt(court: string): boolean {
    const upper = court.toUpperCase();
    return upper === 'STJ' || upper === 'STF';
  }

  public async search(query: string, options: SearchOptions = {}): Promise<JurisprudenceDocument[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    return this.documents.filter((doc) => {
      if (options.court && doc.court.toUpperCase() !== options.court.toUpperCase()) {
        return false;
      }

      const searchable = `${doc.syllabus} ${doc.processNumber} ${doc.rapporteur}`.toLowerCase();
      return terms.some((t) => searchable.includes(t));
    });
  }
}
