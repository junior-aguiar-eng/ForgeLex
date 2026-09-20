import type { AgentTool, ToolRegistry } from '@forgelex/agent-core';
import type { ImpactLevel } from '@forgelex/domain';
import { getForgeLexBillingPolicy } from '@forgelex/billing-ledger';
import { createGetAuthorityTool } from '../research/get-authority.js';
import { ResearchService } from '../research/research-service.js';
import { createSearchCaseLawTool } from '../research/search-case-law.js';
import { createVerifyAuthorityTool } from '../research/verify-authority.js';

export type LegalOperationKind = 'OBSERVATION' | 'ANALYSIS' | 'INTERNAL_MUTATION' | 'EXTERNAL_EFFECT';

export interface LegalToolContract {
  name: 'research.search_case_law' | 'research.get_authority' | 'research.verify_authority';
  contractVersion: '1.0.0';
  description: string;
  requiredScopes: readonly ['research:read'];
  supportedCourts: readonly ['STJ'];
  operationKind: LegalOperationKind;
  impactLevel: ImpactLevel;
  humanApproval: { required: boolean; reason: string };
  preconditions: readonly string[];
  limits: { timeoutMs: number; cancellable: true; maxResults?: number };
  billing: { mode: 'METERED'; unit: 'STJ_CASE_LAW_SEARCH'; costCents: 20 } | { mode: 'FREE'; unit: null; costCents: 0 };
  errorCodes: readonly string[];
  provenance: { required: true; source: 'forgelex_index'; upstreamSource: 'STJ Open Data Oficial' };
}

export class LegalToolGatewayError extends Error {
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    public readonly code: 'UNSUPPORTED_COURT' | 'UNAUTHORIZED_CAPABILITY' | 'SOURCE_PROVIDER_UNAVAILABLE' | 'TOOL_CONTRACT_VIOLATION',
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'LegalToolGatewayError';
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  public toJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable, details: this.details };
  }
}

const COMMON_ERRORS = ['UNSUPPORTED_COURT', 'SOURCE_PROVIDER_UNAVAILABLE', 'SOURCE_PROVIDER_TIMEOUT', 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE', 'INVALID_INPUT', 'TOOL_EXECUTION_FAILED', 'SESSION_CANCELLED'] as const;

export const LEGAL_TOOL_CONTRACTS: readonly LegalToolContract[] = [
  {
    name: 'research.search_case_law', contractVersion: '1.0.0',
    description: 'Pesquisa jurisprudência persistida do STJ para localizar autoridades e metadados verificáveis. Use antes de citar uma autoridade; a resposta não sintetiza conclusão jurídica.',
    requiredScopes: ['research:read'], supportedCourts: ['STJ'], operationKind: 'OBSERVATION', impactLevel: 'L0_OBSERVATION',
    humanApproval: { required: false, reason: 'A tool apenas consulta o índice jurisprudencial persistido.' },
    preconditions: ['Consulta com ao menos dois caracteres.', 'Tribunal STJ habilitado.', 'Idempotency-Key no canal de distribuição.'],
    limits: { timeoutMs: 15_000, cancellable: true, maxResults: 20 },
    billing: { mode: 'METERED', unit: 'STJ_CASE_LAW_SEARCH', costCents: 20 },
    errorCodes: COMMON_ERRORS, provenance: { required: true, source: 'forgelex_index', upstreamSource: 'STJ Open Data Oficial' },
  },
  {
    name: 'research.get_authority', contractVersion: '1.0.0',
    description: 'Obtém uma autoridade identificada no índice persistido do STJ e devolve status de verificação e proveniência. Não trate ausência como confirmação nem complete metadados ausentes.',
    requiredScopes: ['research:read'], supportedCourts: ['STJ'], operationKind: 'OBSERVATION', impactLevel: 'L0_OBSERVATION',
    humanApproval: { required: false, reason: 'A tool apenas recupera uma autoridade já indexada.' },
    preconditions: ['Número de processo informado.', 'Tribunal STJ habilitado.', 'Idempotency-Key no canal de distribuição.'],
    limits: { timeoutMs: 15_000, cancellable: true }, billing: { mode: 'FREE', unit: null, costCents: 0 },
    errorCodes: COMMON_ERRORS, provenance: { required: true, source: 'forgelex_index', upstreamSource: 'STJ Open Data Oficial' },
  },
  {
    name: 'research.verify_authority', contractVersion: '1.0.0',
    description: 'Confere uma autoridade do STJ contra o índice persistido, expondo divergências e proveniência. O status retornado limita-se aos dados localizados; não invente autoridade ou confirmação.',
    requiredScopes: ['research:read'], supportedCourts: ['STJ'], operationKind: 'OBSERVATION', impactLevel: 'L0_OBSERVATION',
    humanApproval: { required: false, reason: 'A tool somente confere dados já persistidos.' },
    preconditions: ['Número de processo informado.', 'Tribunal STJ habilitado.', 'Idempotency-Key no canal de distribuição.'],
    limits: { timeoutMs: 15_000, cancellable: true }, billing: { mode: 'FREE', unit: null, costCents: 0 },
    errorCodes: COMMON_ERRORS, provenance: { required: true, source: 'forgelex_index', upstreamSource: 'STJ Open Data Oficial' },
  },
] as const;

export function getLegalToolContract(name: string): LegalToolContract | undefined {
  return LEGAL_TOOL_CONTRACTS.find((contract) => contract.name === name);
}

export class LegalToolGateway {
  private readonly tools: readonly AgentTool[];

  public constructor(researchService: ResearchService) {
    const tools: AgentTool<any, any>[] = [
      createSearchCaseLawTool(researchService),
      createGetAuthorityTool(researchService),
      createVerifyAuthorityTool(researchService),
    ];
    this.tools = tools.map((tool) => ({
      ...tool,
      impactLevel: 'L0_OBSERVATION' as const,
      execute: async (input, context) => {
        const candidate = input as { court?: unknown };
        this.assertCourtCapability(typeof candidate.court === 'string' ? candidate.court : 'STJ');
        return tool.execute(input, context);
      },
    }));
  }

  public listContracts(): readonly LegalToolContract[] { return LEGAL_TOOL_CONTRACTS; }

  public requireContract(name: string): LegalToolContract {
    const contract = getLegalToolContract(name);
    if (!contract) throw new LegalToolGatewayError('UNAUTHORIZED_CAPABILITY', `A capability '${name}' não está habilitada no Legal Tool Gateway.`);
    return contract;
  }

  public assertCourtCapability(court: string): void {
    if (court.trim().toUpperCase() !== 'STJ') {
      throw new LegalToolGatewayError('UNSUPPORTED_COURT', `O tribunal '${court.trim().toUpperCase()}' não está habilitado para pesquisa.`, { details: { supportedCourts: ['STJ'] } });
    }
  }

  public registerInto(registry: ToolRegistry): void {
    for (const tool of this.tools) {
      const contract = this.requireContract(tool.name);
      const billing = getForgeLexBillingPolicy(tool.name);
      if (contract.billing.mode !== billing.mode || (billing.mode === 'METERED' && contract.billing.costCents !== billing.costCents)) {
        throw new LegalToolGatewayError('TOOL_CONTRACT_VIOLATION', `A classificação comercial de '${tool.name}' diverge do ledger.`);
      }
      registry.register(tool);
    }
  }
}

export function createLegalToolGateway(researchService: ResearchService): LegalToolGateway {
  return new LegalToolGateway(researchService);
}
