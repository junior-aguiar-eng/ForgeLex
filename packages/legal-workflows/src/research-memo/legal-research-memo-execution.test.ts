import { describe, expect, it } from 'vitest';
import { AgentRuntime, FakeAgentProvider, PolicyEngine, ToolRegistry } from '@forgelex/agent-core';
import { createLegalToolGateway, createFixtureResearchService } from '@forgelex/legal-tools';
import {
  createDatabase,
  LegalIssueRepository,
  MatterAuthorityRepository,
  MatterRepository,
  PersistentWorkflowCheckpointStore,
  ResearchMemoRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
import {
  createLegalResearchMemoTool,
  LEGAL_RESEARCH_MEMO_DEFINITION,
  isAcceptedAuthorityVerification,
  LegalResearchMemoExecutionService,
} from './legal-research-memo-execution.js';

describe('execução canônica do legal-research-memo', () => {
  it('publica definição versionada com schemas, capabilities, limites e aprovação humana', () => {
    expect(LEGAL_RESEARCH_MEMO_DEFINITION).toMatchObject({
      id: 'legal-research-memo', version: '3.0.0',
      capabilities: ['research.search_case_law', 'research.verify_authority'],
      limits: { supportedCourts: ['STJ'], maxResults: 20 },
      approvalPolicy: { resultStatus: 'PENDING_HUMAN_REVIEW', explicitDecisionRequired: true },
    });
    expect(LEGAL_RESEARCH_MEMO_DEFINITION.inputSchema.safeParse({}).success).toBe(false);
    expect(LEGAL_RESEARCH_MEMO_DEFINITION.outputSchema).toBeDefined();
  });

  it('não trata verificação conflitante, ausente ou não verificada como authority confirmada', () => {
    expect(isAcceptedAuthorityVerification('VERIFIED_OFFICIAL')).toBe(true);
    expect(isAcceptedAuthorityVerification('VERIFIED_PROVIDER')).toBe(true);
    expect(isAcceptedAuthorityVerification('CONFLICTING_METADATA')).toBe(false);
    expect(isAcceptedAuthorityVerification('UNVERIFIED')).toBe(false);
    expect(isAcceptedAuthorityVerification('NOT_FOUND')).toBe(false);
  });
  it('persiste um único memo revisável e checkpoints tenant-isolados no replay REST/MCP/Agent Core', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    try {
      await runPersistenceMigrations(connection.client);
      const matters = new MatterRepository(connection.db);
      const issues = new LegalIssueRepository(connection.db);
      const memos = new ResearchMemoRepository(connection.db);
      const checkpoints = new PersistentWorkflowCheckpointStore(connection.db);
      const matterAuthorities = new MatterAuthorityRepository(connection.db);
      const matter = await matters.createMatter({
        tenantId: 'tenant_workflow', createdBy: 'user_workflow', title: 'Caso STJ',
      });
      const issue = await issues.createIssue({
        tenantId: 'tenant_workflow', matterId: matter.id, createdBy: 'user_workflow',
        statement: 'Responsabilidade por vazamento de dados',
      });
      const registry = new ToolRegistry();
      createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
      const service = new LegalResearchMemoExecutionService({
        matterRepository: matters,
        legalIssueRepository: issues,
        researchMemoRepository: memos,
        checkpointStore: checkpoints,
        matterAuthorityRepository: matterAuthorities,
        toolRegistry: registry,
      });
      registry.register(createLegalResearchMemoTool(service));
      const input = {
        matterId: matter.id,
        query: 'vazamento de dados LGPD dano moral',
        court: 'STJ',
        limit: 10,
        issueIds: [issue.id],
        idempotencyKey: 'memo-canonical-1',
      };
      const context = {
        sessionId: 'rest-session', tenantId: 'tenant_workflow', userId: 'user_workflow',
        abortSignal: new AbortController().signal,
      };

      const first = await registry.executeTool('workflow.legal_research_memo', input, context);
      const replay = await registry.executeTool('workflow.legal_research_memo', input, {
        ...context, sessionId: 'mcp-session',
      });
      const agentProvider = new FakeAgentProvider(registry, new PolicyEngine(), [{
        thought: 'Executar o workflow canônico sem sintetizar autoridade no provider.',
        toolCall: { name: 'workflow.legal_research_memo', input: { ...input, source: 'REST' } },
      }]);
      const agentEvents = [];
      for await (const event of new AgentRuntime({ provider: agentProvider, toolRegistry: registry }).run({
        sessionId: 'agent-session', tenantId: 'tenant_workflow', userId: 'user_workflow', matterId: matter.id,
        prompt: 'Executar research memo do matter.',
      })) agentEvents.push(event);
      const agentCompleted = agentEvents.find((event) => event.type === 'tool:completed');

      expect(first.data).toMatchObject({
        workflowId: 'legal-research-memo', workflowVersion: '3.0.0',
        source: 'REST', idempotentReplay: false,
        record: { status: 'PENDING_HUMAN_REVIEW' },
      });
      expect(replay.data).toMatchObject({
        workflowId: 'legal-research-memo', workflowVersion: '3.0.0',
        idempotentReplay: true,
        record: { id: (first.data as any).record.id },
      });
      expect(agentCompleted).toMatchObject({
        type: 'tool:completed', toolName: 'workflow.legal_research_memo',
        output: { source: 'AGENT_CORE', idempotentReplay: true, record: { id: (first.data as any).record.id } },
      });
      expect(await memos.listMemos('tenant_workflow', matter.id)).toHaveLength(1);
      await expect(service.execute({ ...input, query: 'consulta diferente' }, {
        tenantId: 'tenant_workflow', userId: 'user_workflow', sessionId: 'rest-conflict',
      })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
      const savedAuthorities = await matterAuthorities.listAuthorities('tenant_workflow', matter.id);
      expect(savedAuthorities).toHaveLength(1);
      expect(await matterAuthorities.listVerifications('tenant_workflow', matter.id, savedAuthorities[0].id)).toMatchObject([
        { status: 'VERIFIED_OFFICIAL', authoritySnapshot: { processNumber: 'REsp 1.823.450/SP' } },
      ]);
      const executionId = (first.data as any).executionId as string;
      expect(await checkpoints.getLatest(executionId, 'tenant_other')).toBeUndefined();
      expect(await checkpoints.getLatest(executionId, 'tenant_workflow')).toMatchObject({
        source: 'REST', idempotencyKey: 'memo-canonical-1', workflowVersion: '3.0.0',
      });
      expect((await checkpoints.list(executionId, 'tenant_workflow')).map((item) => item.stepId)).toEqual([
        'intake', 'issues', 'search', 'verify', 'synthesize', 'adversarial-check', 'memo', 'human-review', '__completed__',
      ]);
    } finally {
      connection.client.close();
    }
  });

  it('não persiste memo quando a busca jurídica falha', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    try {
      await runPersistenceMigrations(connection.client);
      const matters = new MatterRepository(connection.db);
      const memos = new ResearchMemoRepository(connection.db);
      const matter = await matters.createMatter({ tenantId: 'tenant_failure', createdBy: 'user_failure', title: 'Caso sem índice' });
      const registry = new ToolRegistry();
      registry.register({
        name: 'research.search_case_law', description: 'falha', impactLevel: 'L0_OBSERVATION',
        inputSchema: (await import('@forgelex/legal-tools')).SearchCaseLawInputSchema,
        outputSchema: (await import('@forgelex/legal-tools')).SearchCaseLawOutputSchema,
        execute: async () => { throw Object.assign(new Error('índice indisponível'), { code: 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE' }); },
      });
      const service = new LegalResearchMemoExecutionService({
        matterRepository: matters,
        legalIssueRepository: new LegalIssueRepository(connection.db),
        researchMemoRepository: memos,
        checkpointStore: new PersistentWorkflowCheckpointStore(connection.db),
        matterAuthorityRepository: new MatterAuthorityRepository(connection.db),
        toolRegistry: registry,
      });
      await expect(service.execute({
        matterId: matter.id, query: 'tema jurídico relevante', court: 'STJ', limit: 10,
        issueIds: [], idempotencyKey: 'memo-failure-1', source: 'REST',
      }, { tenantId: 'tenant_failure', userId: 'user_failure', sessionId: 'failure-session' }))
        .rejects.toThrow('índice indisponível');
      expect(await memos.listMemos('tenant_failure', matter.id)).toEqual([]);
    } finally {
      connection.client.close();
    }
  });
});
