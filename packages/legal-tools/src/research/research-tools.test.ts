import { describe, expect, it, vi } from 'vitest';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';
import { JurisprudenceSearchService } from '@forgelex/legal-data';
import { createSearchCaseLawTool } from './search-case-law.js';
import { createVerifyAuthorityTool } from './verify-authority.js';
import { createGetAuthorityTool } from './get-authority.js';
import { ResearchService } from './research-service.js';

const context = {
  sessionId: 'session_test',
  tenantId: 'tenant_test',
  userId: 'user_test',
  abortSignal: new AbortController().signal,
};

function createService(): ResearchService {
  const router = new SourceRouter();
  router.registerProvider(new CanonicalFixtureProvider());
  return new ResearchService(router);
}

describe('Research tools', () => {
  it('deve executar pesquisa através do SourceRouter injetado', async () => {
    const result = await createSearchCaseLawTool(createService()).execute(
      { query: 'vazamento de dados', court: 'STJ', limit: 10 },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].provenance.source.provider).toBe('provider_canonical_fixtures');
  });

  it('deve classificar autoridade encontrada como verificada oficialmente', async () => {
    const result = await createVerifyAuthorityTool(createService()).execute(
      { court: 'STJ', processNumber: 'REsp 1.823.450/SP', judgmentDate: '2023-04-18' },
      context
    );

    expect(result.data.status).toBe('VERIFIED_OFFICIAL');
    expect(result.data.authority?.processNumber).toBe('REsp 1.823.450/SP');
  });

  it('deve obter uma autoridade através da capability de distribuição', async () => {
    const result = await createGetAuthorityTool(createService()).execute(
      { court: 'STJ', processNumber: 'REsp 1.823.450/SP' },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.data.authority?.court).toBe('STJ');
    expect(result.data.authority?.provenance.source.provider).toBe('provider_canonical_fixtures');
  });

  it('deve expor conflito quando a data informada divergir da fonte', async () => {
    const result = await createVerifyAuthorityTool(createService()).execute(
      { court: 'STJ', processNumber: 'REsp 1.823.450/SP', judgmentDate: '2024-01-01' },
      context
    );

    expect(result.data.status).toBe('CONFLICTING_METADATA');
    expect(result.data.reason).toContain('diverge');
  });

  it('usa o corpus persistido sem consultar o provider de aquisição no caminho comercial', async () => {
    const provider = new CanonicalFixtureProvider();
    const router = new SourceRouter();
    router.registerProvider(provider);
    const documents = await provider.search('vazamento de dados', { court: 'STJ', limit: 10 });
    const liveSearch = vi.spyOn(provider, 'search');
    const service = new ResearchService(router, new JurisprudenceSearchService({
      async search() { return documents; },
    }));

    const result = await service.searchCaseLaw({ query: 'vazamento de dados', court: 'STJ', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(liveSearch).not.toHaveBeenCalled();
  });
});
