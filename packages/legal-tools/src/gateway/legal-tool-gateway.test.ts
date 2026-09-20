import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { createLegalToolGateway, LegalToolGatewayError } from './legal-tool-gateway.js';
import { createFixtureResearchService } from '../research/research-service.js';

describe('Legal Tool Gateway', () => {
  it('publica contratos versionados, semânticos e auditáveis apenas para as capabilities STJ habilitadas', () => {
    const gateway = createLegalToolGateway(createFixtureResearchService());
    const contracts = gateway.listContracts();

    expect(contracts.map((contract) => contract.name)).toEqual([
      'research.search_case_law',
      'research.get_authority',
      'research.verify_authority',
    ]);
    expect(contracts[0]).toMatchObject({
      contractVersion: '1.0.0',
      requiredScopes: ['research:read'],
      operationKind: 'OBSERVATION',
      humanApproval: { required: false },
      billing: { mode: 'METERED', unit: 'STJ_CASE_LAW_SEARCH', costCents: 20 },
    });
    expect(contracts[0].description).toContain('STJ');
    expect(contracts[0].description).not.toContain('token');
  });

  it('valida o schema de saída e preserva o envelope de proveniência da tool', async () => {
    const gateway = createLegalToolGateway(createFixtureResearchService());
    const registry = new ToolRegistry();
    gateway.registerInto(registry);

    const result = await registry.executeTool('research.search_case_law', {
      query: 'vazamento de dados', court: 'STJ', limit: 10,
    }, {
      sessionId: 'gateway_test', tenantId: 'tenant_test', userId: 'user_test', abortSignal: new AbortController().signal,
    });

    expect(result.success).toBe(true);
    expect(result.provenance?.[0]?.source.provider).toBe('provider_canonical_fixtures');
  });

  it('rejeita capability e tribunal fora do contrato antes de uma operação comercial', () => {
    const gateway = createLegalToolGateway(createFixtureResearchService());

    expect(() => gateway.requireContract('research.generate_memo')).toThrowError(LegalToolGatewayError);
    try {
      gateway.assertCourtCapability('STF');
      throw new Error('A capability STF deveria ser rejeitada.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'UNSUPPORTED_COURT' });
    }
  });
});
