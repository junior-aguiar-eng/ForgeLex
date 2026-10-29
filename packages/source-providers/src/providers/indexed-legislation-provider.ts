import { LegislationService, type LegislationReadPort, type LegislationRequest } from '@forgelex/legal-data';
import { LegislationCatalog } from '@forgelex/source-catalog';

/** Separate from case-law SourceRouter: no new court/provider or public capability. */
export class IndexedLegislationProvider {
  readonly id = 'indexed-legislation';
  private readonly service: LegislationService;
  constructor(repository: LegislationReadPort, catalog = new LegislationCatalog()) {
    this.service = new LegislationService(repository, (n, p) => catalog.find(n, p));
  }
  retrieve(request: LegislationRequest) {
    return this.service.retrieve(request);
  }
}
