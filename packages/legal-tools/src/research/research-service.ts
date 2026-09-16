import { CaseLaw, CaseLawSchema } from '@forgelex/domain';
import { JurisprudenceDocument } from '@forgelex/legal-data';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';

export interface SearchCaseLawRequest {
  query: string;
  court?: string;
  limit: number;
}

export interface SearchCaseLawResponse {
  items: CaseLaw[];
  total: number;
  queryExecuted: string;
  courtFilter?: string;
}

export interface VerifyAuthorityRequest {
  court: string;
  processNumber: string;
  judgmentDate?: string;
}

export interface VerifyAuthorityResponse {
  status: 'VERIFIED_OFFICIAL' | 'VERIFIED_PROVIDER' | 'UNVERIFIED' | 'CONFLICTING_METADATA' | 'NOT_FOUND';
  providerId?: string;
  checkedAt: string;
  authority?: CaseLaw;
  reason?: string;
}

function toCaseLaw(document: JurisprudenceDocument): CaseLaw {
  return CaseLawSchema.parse({
    id: document.id,
    court: document.court,
    processNumber: document.processNumber,
    rapporteur: document.rapporteur,
    chamber: document.chamber,
    judgmentDate: document.judgmentDate,
    publicationDate: document.publicationDate,
    syllabus: document.syllabus,
    fullTextUrl: document.provenance.source.sourceUrl,
    dedupeKey: document.dedupeKey,
    provenance: document.provenance,
  });
}

export class ResearchService {
  constructor(private readonly sourceRouter: SourceRouter) {}

  public async searchCaseLaw(request: SearchCaseLawRequest): Promise<SearchCaseLawResponse> {
    const documents = await this.sourceRouter.search(request.query, {
      court: request.court,
      limit: request.limit,
    });

    return {
      items: documents.map(toCaseLaw),
      total: documents.length,
      queryExecuted: request.query,
      courtFilter: request.court,
    };
  }

  public async verifyAuthority(request: VerifyAuthorityRequest): Promise<VerifyAuthorityResponse> {
    const result = await this.sourceRouter.verifyAuthority(request);
    return {
      status: result.status,
      providerId: result.providerId,
      checkedAt: result.checkedAt,
      authority: result.document ? toCaseLaw(result.document) : undefined,
      reason: result.reason,
    };
  }
}

export function createFixtureResearchService(): ResearchService {
  const router = new SourceRouter();
  router.registerProvider(new CanonicalFixtureProvider());
  return new ResearchService(router);
}
