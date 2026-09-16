import { JurisprudenceDocument } from '@forgelex/legal-data';

export interface SearchOptions {
  court?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
}

export interface LegalSourceProvider {
  readonly id: string;
  readonly name: string;
  readonly isOfficial: boolean;
  supportsCourt(court: string): boolean;
  search(query: string, options?: SearchOptions): Promise<JurisprudenceDocument[]>;
}
