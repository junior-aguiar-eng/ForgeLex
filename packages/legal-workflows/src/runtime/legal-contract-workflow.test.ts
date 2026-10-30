import { describe, expect, it } from 'vitest';
import { InMemoryWorkflowCheckpointStore } from './workflow-runner.js';
import { LegalContractWorkflow } from './legal-contract-workflow.js';

const input = {
  action: 'analyze_documents',
  contextId: 'context-1',
  contextRevision: 1,
  objective: 'Organizar o relato',
  constraints: [],
  sources: [{ id: 'text-1', kind: 'USER_TEXT', contentHash: 'a'.repeat(64) }],
};
const output = {
  action: 'analyze_documents',
  contextId: 'context-1',
  contextRevision: 1,
  status: 'LIMITED',
  humanReviewRequired: true,
  limitations: ['Data não informada.'],
  findings: [{ statement: 'A data não foi fornecida.', classification: 'GAP', sourceIds: [] }],
};
const context = { tenantId: 'tenant-1', userId: 'boni', executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

describe('Tarefa 0: versões dos contratos consumidos no run', () => {
  it('registra versões no checkpoint e no resultado, sem executar modelo', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new LegalContractWorkflow('analyze_documents', async () => output, store);
    const events = [];
    for await (const event of workflow.execute(input, context)) events.push(event);
    const checkpoint = store.list(context.executionId).at(-1)!;
    expect(checkpoint.status).toBe('COMPLETED');
    expect(checkpoint.state).toMatchObject({
      contracts: {
        workflow: { id: 'analyze_documents-workflow', version: '1.0.0' },
        policy: { id: 'legal-work-policy', version: '1.0.0' },
        playbook: { id: 'analyze_documents-playbook', version: '1.0.0' },
        agents: [{ role: 'matter-analyst', instructionVersion: '1.0.0' }],
        documentTemplate: null,
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'workflow:completed',
      result: { output, contracts: (checkpoint.state as { contracts: unknown }).contracts },
    });
  });
  it('rejeita entrega incompatível e registra falha sem concluir o workflow', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new LegalContractWorkflow(
      'analyze_documents',
      async () => ({ ...output, contextRevision: 2 }),
      store,
    );
    const events = [];
    for await (const event of workflow.execute(input, context)) events.push(event);
    expect(events.at(-1)?.type).toBe('workflow:failed');
    expect(store.list(context.executionId).at(-1)?.status).toBe('FAILED');
  });
  it('não retoma um run com contexto alterado', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new LegalContractWorkflow('analyze_documents', async () => output, store);
    for await (const event of workflow.execute(input, context)) {
      void event;
    }
    const resumed = workflow.execute(
      { ...input, contextRevision: 2 },
      { tenantId: context.tenantId, userId: context.userId, resumeExecutionId: context.executionId },
    );
    await expect(resumed.next()).rejects.toThrow('contexto');
  });
  it('não transforma retomada inexistente em nova execução', async () => {
    let calls = 0;
    const workflow = new LegalContractWorkflow('analyze_documents', async () => {
      calls++;
      return output;
    });
    const resumed = workflow.execute(input, {
      tenantId: context.tenantId,
      userId: context.userId,
      resumeExecutionId: context.executionId,
    });
    await expect(resumed.next()).rejects.toThrow('checkpoint');
    expect(calls).toBe(0);
  });
  it('não retoma checkpoint de outro usuário', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new LegalContractWorkflow('analyze_documents', async () => output, store);
    for await (const event of workflow.execute(input, context)) {
      void event;
    }
    const resumed = workflow.execute(input, {
      tenantId: context.tenantId,
      userId: 'other-user',
      resumeExecutionId: context.executionId,
    });
    await expect(resumed.next()).rejects.toThrow('usuário');
  });
  it('não transfere run entre casos nem entre caso vinculado e contexto sem caso', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new LegalContractWorkflow('analyze_documents', async () => output, store);
    for await (const event of workflow.execute(input, { ...context, matterId: 'case-a' })) {
      void event;
    }
    for (const matterId of ['case-b', undefined]) {
      const resumed = workflow.execute(input, {
        tenantId: context.tenantId,
        userId: context.userId,
        matterId,
        resumeExecutionId: context.executionId,
      });
      await expect(resumed.next()).rejects.toThrow('caso');
    }
  });
  it('fornece ao handler a política, instruções e playbook cujas versões registra', async () => {
    const workflow = new LegalContractWorkflow('analyze_documents', async (_input, _context, specification) => {
      expect(specification.policy.version).toBe(specification.contracts.policy.version);
      expect(specification.playbook.version).toBe(specification.contracts.playbook.version);
      expect(specification.instructions).toEqual([
        expect.objectContaining({
          id: specification.contracts.agents[0].instructionId,
          version: specification.contracts.agents[0].instructionVersion,
        }),
      ]);
      return output;
    });
    const events = [];
    for await (const event of workflow.execute(input, context)) events.push(event);
    expect(events.at(-1)?.type).toBe('workflow:completed');
  });
});
