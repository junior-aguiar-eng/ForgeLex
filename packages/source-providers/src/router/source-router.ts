import { LegalSourceProvider, SearchOptions } from '../contracts/legal-source-provider.js';
import { JurisprudenceDocument } from '@forgelex/legal-data';

export class SourceRouter {
  private readonly providers: LegalSourceProvider[] = [];

  public registerProvider(provider: LegalSourceProvider): void {
    this.providers.push(provider);
  }

  public getProviders(): LegalSourceProvider[] {
    return [...this.providers];
  }

  /**
   * Consulta os provedores elegíveis e reconcilia resultados por dedupeKey,
   * garantindo que acórdãos idênticos vindos de fontes distintas não dupliquem.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<JurisprudenceDocument[]> {
    const eligibleProviders = this.providers.filter((p) => {
      if (!options.court) return true;
      return p.supportsCourt(options.court);
    });

    // Se nenhum provedor elegível for encontrado, retorna vazio
    if (eligibleProviders.length === 0) {
      return [];
    }

    // Consulta todos os provedores em paralelo
    const searchPromises = eligibleProviders.map((p) =>
      p.search(query, options).catch((err) => {
        // Tolerância a falhas parciais de rede/provedor externo
        console.warn(`[SourceRouter] Falha no provedor ${p.id}:`, err);
        return [] as JurisprudenceDocument[];
      })
    );

    const allResultsArrays = await Promise.all(searchPromises);
    const combined = allResultsArrays.flat();

    // Reconciliação determinística por dedupeKey
    const deduplicatedMap = new Map<string, JurisprudenceDocument>();

    for (const doc of combined) {
      const existing = deduplicatedMap.get(doc.dedupeKey);
      if (!existing) {
        deduplicatedMap.set(doc.dedupeKey, doc);
      } else {
        // Se já existe, atualiza lastSeenAt para a data mais recente
        // e preserva a proveniência oficial se o novo não for oficial
        const earliestFirstSeen =
          new Date(doc.firstSeenAt) < new Date(existing.firstSeenAt) ? doc.firstSeenAt : existing.firstSeenAt;
        const latestLastSeen =
          new Date(doc.lastSeenAt) > new Date(existing.lastSeenAt) ? doc.lastSeenAt : existing.lastSeenAt;

        deduplicatedMap.set(doc.dedupeKey, {
          ...existing,
          firstSeenAt: earliestFirstSeen,
          lastSeenAt: latestLastSeen,
        });
      }
    }

    const finalResults = Array.from(deduplicatedMap.values());
    const limit = options.limit ?? 20;
    return finalResults.slice(0, limit);
  }
}
