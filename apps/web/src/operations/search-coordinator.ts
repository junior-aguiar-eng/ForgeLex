import { ApiRequestError } from '../api-client';
import type { SearchExecution, SearchIntent } from './contracts';

/** One lock for both search screens, including history refresh and retries. */
export class SearchCoordinator {
  private pending = false;
  public constructor(
    private readonly execute: (intent: SearchIntent) => Promise<SearchExecution>,
    private readonly onBusy: (busy: boolean) => void = () => {},
  ) {}

  public async search(intent: SearchIntent): Promise<SearchExecution> {
    if (this.pending) throw new ApiRequestError('Já existe uma pesquisa em andamento. Aguarde a conclusão.', 'SEARCH_IN_PROGRESS', 409);
    this.pending = true;
    this.onBusy(true);
    try { return await this.execute(intent); }
    finally { this.pending = false; this.onBusy(false); }
  }
}
