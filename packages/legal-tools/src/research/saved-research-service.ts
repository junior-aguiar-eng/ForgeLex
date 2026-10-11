import { LedgerService, decodeResultSnapshot } from '@forgelex/billing-ledger';
import { SavedResearchRepository, savedResearchError, type ResearchOwner, type ResearchConnection, type SavedResearchRecord } from '@forgelex/persistence';
import { SearchCaseLawOutputSchema, type SearchCaseLawOutput } from './search-case-law.js';

export type SavedResearchSummary = Omit<SavedResearchRecord, 'snapshot'>;
export type SavedResearch = SavedResearchSummary & { results: SearchCaseLawOutput };
export class SavedResearchService {
  constructor(public readonly repository: SavedResearchRepository, private readonly ledger: LedgerService) {}
  private summary({ snapshot: _snapshot, ...summary }: SavedResearchRecord): SavedResearchSummary { return summary; }
  private open(record: SavedResearchRecord): SavedResearch {
    return { ...this.summary(record), results: SearchCaseLawOutputSchema.parse(decodeResultSnapshot(record.snapshot)) };
  }
  async list(owner: ResearchOwner, connection?: ResearchConnection): Promise<SavedResearchSummary[]> {
    return (await this.repository.list(owner, connection)).map(row => this.summary(row));
  }
  async get(owner: ResearchOwner, id: string, connection?: ResearchConnection): Promise<SavedResearch> {
    const record = await this.repository.get(owner, id, connection);
    if (!record) throw savedResearchError('SAVED_RESEARCH_NOT_FOUND', 'Esta pesquisa salva não está disponível.');
    return this.open(record);
  }
  async save(owner: ResearchOwner, operationId: string, connection?: ResearchConnection): Promise<SavedResearchSummary> {
    const existing = (await this.repository.list(owner, connection)).find(row => row.operationId === operationId);
    if (existing) return this.summary(existing);
    const original = await this.ledger.readCompletedSearch(owner.tenantId, owner.userId, operationId);
    const results = SearchCaseLawOutputSchema.parse(decodeResultSnapshot(original.snapshot));
    if (!results.criteria || results.items.some(item => !item.versionId)) throw savedResearchError('SAVED_RESEARCH_UNAVAILABLE', 'Esta pesquisa antiga não contém as referências necessárias para salvar. Nenhuma nova pesquisa foi executada.');
    return this.summary(await this.repository.save(owner, { operationId, snapshot: original.snapshot,
      criteria: results.criteria, resultCount: results.items.length, searchedAt: original.createdAt }, connection));
  }
  async completed(owner: ResearchOwner, operationId: string): Promise<{ results: SearchCaseLawOutput; searchedAt: string }> {
    const original = await this.ledger.readCompletedSearch(owner.tenantId, owner.userId, operationId);
    return { results: SearchCaseLawOutputSchema.parse(decodeResultSnapshot(original.snapshot)), searchedAt: original.createdAt };
  }
  async delete(owner: ResearchOwner, id: string, connection?: ResearchConnection): Promise<void> { await this.repository.delete(owner, id, connection); }
}
