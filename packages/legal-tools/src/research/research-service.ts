import { CaseLaw, CaseLawSchema } from '@forgelex/domain';
import { JurisprudenceDocument, JurisprudenceSearchService } from '@forgelex/legal-data';
import { CanonicalFixtureProvider, SourceRouter, SourceRouterError } from '@forgelex/source-providers';

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
    fullTextUrl: document.officialUrl,
    dedupeKey: document.dedupeKey,
    provenance: document.provenance,
  });
}

export class ResearchService {
  constructor(
    private readonly sourceRouter: SourceRouter,
    private readonly jurisprudenceSearchService?: JurisprudenceSearchService,
    private readonly options: { requirePersistentDataPlane?: boolean } = {},
  ) {}

  public async searchCaseLaw(request: SearchCaseLawRequest): Promise<SearchCaseLawResponse> {
    const effectiveCourt = request.court ?? this.sourceRouter.getDefaultSearchCourt();
    if (effectiveCourt && !this.sourceRouter.isCourtSearchable(effectiveCourt)) {
      throw new SourceRouterError(
        'UNSUPPORTED_COURT',
        `O tribunal '${effectiveCourt.trim().toUpperCase()}' não está habilitado para pesquisa.`,
      );
    }
    if (!this.jurisprudenceSearchService && this.options.requirePersistentDataPlane) {
      throw Object.assign(
        new Error('O índice jurisprudencial persistido não está disponível.'),
        { code: 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE' },
      );
    }
    const documents = this.jurisprudenceSearchService
      ? await this.jurisprudenceSearchService.search({ query: request.query, court: effectiveCourt, limit: request.limit })
      : await this.sourceRouter.search(request.query, {
        court: effectiveCourt,
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
    if (!this.sourceRouter.isCourtSearchable(request.court)) {
      throw new SourceRouterError(
        'UNSUPPORTED_COURT',
        `O tribunal '${request.court.trim().toUpperCase()}' não está habilitado para pesquisa.`,
      );
    }
    if (this.jurisprudenceSearchService) {
      const document = await this.jurisprudenceSearchService.getByProcessNumber({
        court: request.court,
        processNumber: request.processNumber,
      });
      const checkedAt = new Date().toISOString();
      if (!document) {
        return { status: 'NOT_FOUND', checkedAt, reason: 'Autoridade não encontrada no corpus jurisprudencial persistido.' };
      }
      if (request.judgmentDate && request.judgmentDate !== document.judgmentDate) {
        return {
          status: 'CONFLICTING_METADATA',
          providerId: document.provenance.source.provider,
          checkedAt,
          authority: toCaseLaw(document),
          reason: `A data informada (${request.judgmentDate}) diverge da fonte (${document.judgmentDate}).`,
        };
      }
      return {
        status: document.provenance.verified
          ? document.provenance.verificationMethod === 'OFFICIAL_SOURCE_HASH' ? 'VERIFIED_OFFICIAL' : 'VERIFIED_PROVIDER'
          : 'UNVERIFIED',
        providerId: document.provenance.source.provider,
        checkedAt,
        authority: toCaseLaw(document),
      };
    }
    if (this.options.requirePersistentDataPlane) {
      throw Object.assign(
        new Error('O índice jurisprudencial persistido não está disponível.'),
        { code: 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE' },
      );
    }
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
