import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';
import { JurisprudenceSearchService } from '@forgelex/legal-data';
import { createSearchCaseLawTool, SearchCaseLawInputSchema } from './search-case-law.js';
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
  it('valida o ano e aplica o intervalo ao índice persistido', async () => {
    const router = new SourceRouter();
    router.registerProvider(new CanonicalFixtureProvider());
    const search = vi.fn(async () => []);
    const service = new ResearchService(router, new JurisprudenceSearchService({ search }));
    const input = SearchCaseLawInputSchema.parse({ query: 'vazamento', court: 'STJ', judgmentYear: 2023 });
    expect(input.judgmentYear).toBe(2023);
    await service.searchCaseLaw(input);
    expect(search).toHaveBeenCalledWith({ query: 'vazamento', court: 'STJ', limit: 10, fromDate: '2023-01-01', toDate: '2023-12-31' });
    for (const judgmentYear of [1988, 2023.5, '2023', new Date().getUTCFullYear() + 1]) {
      expect(SearchCaseLawInputSchema.safeParse({ query: 'vazamento', judgmentYear }).success).toBe(false);
    }
  });

  it('respeita o ano nas fixtures e preserva chamadas sem ano', async () => {
    const service = createService();
    expect((await service.searchCaseLaw({ query: 'vazamento', court: 'STJ', limit: 10, judgmentYear: 2022 })).items).toHaveLength(0);
    expect((await service.searchCaseLaw({ query: 'vazamento', court: 'STJ', limit: 10, judgmentYear: 2023 })).items).toHaveLength(1);
    expect((await service.searchCaseLaw({ query: 'vazamento', court: 'STJ', limit: 10 })).items).toHaveLength(1);
  });
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
describe('Prazo da pesquisa no índice persistido', () => {
  it('permite concluir consulta válida que supera o antigo limite de 15 segundos', async () => {
    const service = createService();
    const spy = vi.spyOn(service, 'searchCaseLaw').mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ items: [], total: 0, queryExecuted: 'consulta ampla' }), 16_000)));
    vi.useFakeTimers();
    try {
      const registry = new ToolRegistry();
      registry.register(createSearchCaseLawTool(service));
      const completion = registry.executeTool('research.search_case_law', { query: 'consulta ampla', limit: 10 }, context).then(result => ({ result }), error => ({ error }));
      await vi.advanceTimersByTimeAsync(16_000);
      expect(await completion).toMatchObject({ result: { success: true, data: { total: 0 } } });
    } finally { vi.useRealTimers(); spy.mockRestore(); }
  });
});
