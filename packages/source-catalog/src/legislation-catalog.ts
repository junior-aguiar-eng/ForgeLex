export interface LegislationCatalogEntry {
  sourceId: string;
  normId: string;
  provisionIds: readonly string[];
  officialUrl: string;
  currentVersionId: string;
}
/** Explicit server coverage. Empty by default; court metadata is not legislative coverage. */
export class LegislationCatalog {
  private readonly entries: readonly LegislationCatalogEntry[];
  constructor(entries: readonly LegislationCatalogEntry[] = []) {
    const ids = new Set<string>();
    for (const e of entries) {
      const u = new URL(e.officialUrl);
      if (
        !e.sourceId.trim() ||
        !e.normId.trim() ||
        !e.currentVersionId.trim() ||
        !e.provisionIds.length ||
        e.provisionIds.some((p) => !p.trim()) ||
        new Set(e.provisionIds).size !== e.provisionIds.length ||
        ids.has(e.normId) ||
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.port ||
        !['www.planalto.gov.br', 'planalto.gov.br'].includes(u.hostname)
      )
        throw new Error('INVALID_LEGISLATION_CATALOG');
      ids.add(e.normId);
    }
    this.entries = entries.map((e) => ({ ...e, provisionIds: [...e.provisionIds] }));
  }
  find(normId: string, provisionId: string): LegislationCatalogEntry | undefined {
    const entry = this.entries.find((e) => e.normId === normId && e.provisionIds.includes(provisionId));
    return entry ? { ...entry, provisionIds: [...entry.provisionIds] } : undefined;
  }
}
