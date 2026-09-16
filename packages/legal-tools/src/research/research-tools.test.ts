import { describe, expect, it } from 'vitest';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';
import { createSearchCaseLawTool } from './search-case-law.js';
import { createVerifyAuthorityTool } from './verify-authority.js';
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

  it('deve expor conflito quando a data informada divergir da fonte', async () => {
    const result = await createVerifyAuthorityTool(createService()).execute(
      { court: 'STJ', processNumber: 'REsp 1.823.450/SP', judgmentDate: '2024-01-01' },
      context
    );

    expect(result.data.status).toBe('CONFLICTING_METADATA');
    expect(result.data.reason).toContain('diverge');
  });
});
