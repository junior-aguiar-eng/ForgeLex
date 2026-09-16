import { JurisprudenceDocument } from '@forgelex/legal-data';

export interface SearchOptions {
  court?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
}

export type ProviderHealthStatus = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';

export interface ProviderHealth {
  providerId: string;
  status: ProviderHealthStatus;
  checkedAt: string;
  detail?: string;
}

export type AuthorityVerificationStatus =
  | 'VERIFIED_OFFICIAL'
  | 'VERIFIED_PROVIDER'
  | 'UNVERIFIED'
  | 'CONFLICTING_METADATA'
  | 'NOT_FOUND';

export interface AuthorityVerificationQuery {
  court: string;
  processNumber: string;
  judgmentDate?: string;
}

export interface AuthorityVerificationResult {
  status: AuthorityVerificationStatus;
  providerId?: string;
  checkedAt: string;
  document?: JurisprudenceDocument;
  reason?: string;
}

export interface LegalSourceProvider {
  readonly id: string;
  readonly name: string;
  readonly isOfficial: boolean;
  supportsCourt(court: string): boolean;
  search(query: string, options?: SearchOptions): Promise<JurisprudenceDocument[]>;
  health?(): Promise<ProviderHealth>;
  verifyAuthority?(query: AuthorityVerificationQuery): Promise<AuthorityVerificationResult>;
}
