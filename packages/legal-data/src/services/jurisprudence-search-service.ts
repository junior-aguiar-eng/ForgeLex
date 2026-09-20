import type { JurisprudenceDocument } from '../contracts/jurisprudence-document.js';

export interface JurisprudenceSearchOptions {
  query: string;
  court?: string;
  processNumber?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface JurisprudenceSearchRepository {
  search(options: JurisprudenceSearchOptions): Promise<JurisprudenceDocument[]>;
  getByProcessNumber?(input: { court: string; processNumber: string }): Promise<JurisprudenceDocument | undefined>;
}

export class JurisprudenceSearchService {
  public constructor(private readonly repository: JurisprudenceSearchRepository) {}

  public search(options: JurisprudenceSearchOptions): Promise<JurisprudenceDocument[]> {
    return this.repository.search(options);
  }

  public getByProcessNumber(input: { court: string; processNumber: string }): Promise<JurisprudenceDocument | undefined> {
    if (!this.repository.getByProcessNumber) {
      return this.repository.search({ query: input.processNumber, court: input.court, limit: 1 })
        .then((documents) => documents[0]);
    }
    return this.repository.getByProcessNumber(input);
  }
}
