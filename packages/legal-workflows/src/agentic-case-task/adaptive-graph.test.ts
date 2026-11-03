import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { FakeAgentProvider, type AgentTool } from '@forgelex/agent-core';
import { AgenticCaseTask, caseTaskStepIndex } from './case-task.js';

const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-graph-v1.json', import.meta.url), 'utf8'));
const empty = () => ({ coveredIssueIds: ['issue'], claims: [], requirements: [], findings: [], supportChecks: [] });
const request = (capability: string) => ({
  capability,
  reason: capability === 'ADVERSARIAL_REVIEW' ? 'MATERIAL_CONFLICT' : 'MISSING_LEGAL_BASIS',
  issueIds: ['issue'],
  sourceIds: ['user:graph'],
});
const plan = {
  action: 'analyze_documents',
  requiresCaseLaw: false,
  requiresNorms: false,
  requiresProcedure: false,
  issues: [{ id: 'issue', statement: 'Analisar o relato', sourceIds: ['user:graph'] }],
  gaps: [],
};
function fixture(
  options: {
    plan?: any;
    tools?: AgentTool<any, any>[];
    sources?: any[];
    steps?: (role: string, visit: number) => { name: string; input: Record<string, unknown> }[];
    output?: (role: string, visit: number, packet: any) => any;
  } = {},
) {
  const roles: string[] = [],
    packets: any[] = [],
    deliveries: any[] = [];
  const selectedPlan = options.plan ?? plan;
  const binding = { ...legacy.binding, executionId: 'adaptive', actionId: selectedPlan.action };
  const task = new AgenticCaseTask({
    context: {
      load: async () => ({
        ...structuredClone(legacy.packet),
        sources: [...structuredClone(legacy.packet.sources), ...(options.sources ?? [])],
      }),
      assert: async () => {},
      save: async (_b, delivery) => {
        deliveries.push(delivery);
        return { id: 'delivery:adaptive' };
      },
    },
    tools: options.tools ?? [],
    createProvider: ({ role, registry, packet }) => {
      roles.push(role);
      packets.push(packet);
      const visit = roles.filter((r) => r === role).length;
      return new FakeAgentProvider(registry, undefined, [
        ...(options.steps?.(role, visit) ?? []).map((toolCall) => ({ toolCall })),
        {
          toolCall: {
            name: 'task.submit',
            input: role === 'legal-orchestrator' ? selectedPlan : (options.output?.(role, visit, packet) ?? empty()),
          },
        },
      ]);
    },
  });
  const step = (state?: any) => task.step(binding, state, new AbortController().signal);
  const finish = async (state?: any) => {
    for (let i = 0; i < 15; i++) {
      const result = await step(state);
      state = result.state;
      if (result.kind !== 'checkpoint') return result;
    }
    throw new Error('GRAPH_DID_NOT_STOP');
  };
  return { task, binding, roles, packets, deliveries, step, finish };
}
const researchTool: AgentTool<any, any> = {
  name: 'research.search_case_law',
  description: 'Synthetic indexed research',
  impactLevel: 'L1_ANALYSIS',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async () => ({ success: true, data: {} }),
};

it('new work records a graph and omits capabilities unnecessary to a simple analysis', async () => {
  const f = fixture();
  const result = await f.finish();
  expect(result.state.version).toBe(8);
  expect(f.roles).toEqual(['legal-orchestrator', 'matter-analyst']);
  expect((result.state as any).graph.nodes).toContainEqual(
    expect.objectContaining({
      role: 'matter-analyst',
      status: 'COMPLETED',
      outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});

it('an unavailable research capability stops without dispatching an ineffective specialist', async () => {
  const f = fixture({ plan: { ...plan, action: 'research_question', requiresCaseLaw: true } });
  await f.finish();
  expect(f.roles).toEqual(['legal-orchestrator']);
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }));
  expect(f.deliveries[0].status).toBe('LIMITED');
});

it('a material conflict found by analysis activates adversarial review', async () => {
  const f = fixture({
    output: (role) =>
      role === 'matter-analyst'
        ? {
            ...empty(),
            claims: [
              {
                id: 'conflict',
                classification: 'CONFLICT',
                statement: 'Relatos incompatíveis',
                sourceIds: ['user:graph'],
              },
            ],
          }
        : empty(),
  });
  await f.finish();
  expect(f.roles).toEqual(['legal-orchestrator', 'matter-analyst', 'adversarial-reviewer']);
});

it('a late research dependency invalidates the draft and review, and delivers only the refined draft', async () => {
  const f = fixture({
    tools: [researchTool],
    plan: { ...plan, action: 'create_document', documentPurpose: 'FACTUAL_RECORD', documentType: 'Registro' },
    output: (role, visit) =>
      role === 'legal-drafter'
        ? {
            ...empty(),
            document: {
              title: visit === 1 ? 'Antes' : 'Depois',
              documentType: 'Registro',
              sections: [
                {
                  title: 'Relato',
                  content: visit === 1 ? 'Texto anterior' : 'Texto refinado',
                  sourceIds: ['user:graph'],
                },
              ],
            },
          }
        : role === 'adversarial-reviewer' && visit === 1
          ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] }
          : empty(),
  });
  const result = await f.finish();
  // Adding a legal-basis requirement removes the narrow factual-only exemption;
  // the existing procedural guard is kept, without choosing a legal measure.
  expect(f.roles).toEqual([
    'legal-orchestrator',
    'matter-analyst',
    'legal-drafter',
    'adversarial-reviewer',
    'legal-researcher',
    'procedural-advisor',
    'legal-drafter',
    'adversarial-reviewer',
  ]);
  expect(f.deliveries[0].document.title).toBe('Depois');
  expect((result.state as any).graph.revision).toBe(1);
  expect(
    Object.values((result.state as any).graph.archivedOutputs).some((o: any) => o.document?.title === 'Antes'),
  ).toBe(true);
});

it('a refinement that cannot fit the role budget leaves the last coherent generation limited', async () => {
  const f = fixture({
    tools: [researchTool],
    plan: {
      ...plan,
      action: 'create_document',
      requiresCaseLaw: true,
      documentPurpose: 'LEGAL_DOCUMENT',
      documentType: 'Parecer',
    },
    output: (role) =>
      role === 'legal-drafter'
        ? {
            ...empty(),
            document: {
              title: 'Última geração consistente',
              documentType: 'Parecer',
              sections: [{ title: 'Contexto', content: 'Conteúdo sintético', sourceIds: ['user:graph'] }],
            },
          }
        : role === 'adversarial-reviewer'
          ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] }
          : empty(),
  });
  const result = await f.finish();
  expect(f.roles.filter((r) => r === 'legal-researcher')).toHaveLength(1);
  expect((result.state as any).graph.revision).toBe(0);
  expect((result.state as any).graph.archivedOutputs).toEqual({});
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'ORCHESTRATION_NODE_LIMIT' }));
  expect(f.deliveries[0].document.title).toBe('Última geração consistente');
});

it('refinement refuses an automatic retry after source unavailability', async () => {
  let calls = 0;
  const unavailable = {
    ...researchTool,
    execute: async () => {
      calls++;
      throw new Error('SOURCE_OFFLINE');
    },
  };
  const f = fixture({
    tools: [unavailable],
    plan: { ...plan, action: 'review_text', requiresCaseLaw: true },
    steps: (role) => (role === 'legal-researcher' ? [{ name: researchTool.name, input: {} }] : []),
    output: (role) =>
      role === 'adversarial-reviewer' ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] } : empty(),
  });
  await f.finish();
  expect(calls).toBe(1);
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'DEPENDENCY_UNRESOLVED' }));
});

it('capability requests must reference issues that actually belong to the plan', async () => {
  const f = fixture({
    output: () => ({ ...empty(), capabilityRequests: [{ ...request('CASE_LAW_RESEARCH'), issueIds: ['fabricated'] }] }),
  });
  await expect(f.finish()).rejects.toThrow('ISSUE_REFERENCE_INVALID');
  expect(f.deliveries).toHaveLength(0);
});

it('terminal verification cannot request more production work', async () => {
  const text = 'Fonte sintética';
  const f = fixture({
    sources: [{ id: 'legal', kind: 'AUTHORITY', text, contentHash: createHash('sha256').update(text).digest('hex') }],
    output: (role) =>
      role === 'authority-verifier' ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] } : empty(),
  });
  await expect(f.finish()).rejects.toThrow();
  expect(f.roles.at(-1)).toBe('authority-verifier');
  expect(f.deliveries).toHaveLength(0);
});

it('a newly requested procedural analysis cannot silently claim completion with no requirements', async () => {
  const f = fixture({
    output: (role) =>
      role === 'matter-analyst'
        ? { ...empty(), capabilityRequests: [{ ...request('PROCEDURAL_ANALYSIS'), reason: 'PROCEDURAL_DEPENDENCY' }] }
        : empty(),
  });
  await f.finish();
  expect(f.roles).toContain('procedural-advisor');
  expect(f.deliveries[0].findings).toContainEqual(
    expect.objectContaining({ code: 'PROCEDURAL_REQUIREMENTS_NOT_EVALUATED' }),
  );
});

it('a second refinement request produces a limitation instead of an unbounded loop', async () => {
  const f = fixture({
    tools: [researchTool],
    plan: { ...plan, action: 'review_text' },
    output: (role) =>
      role === 'adversarial-reviewer' ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] } : empty(),
  });
  await f.finish();
  expect(f.roles.filter((r) => r === 'legal-researcher')).toHaveLength(1);
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'ORCHESTRATION_REPLAN_LIMIT' }));
});

it('resume uses completed graph nodes without replaying them', async () => {
  const f = fixture();
  const first = await f.step();
  const second = await f.step(first.state);
  const resumed = fixture();
  await resumed.finish(JSON.parse(JSON.stringify(second.state)));
  expect(resumed.roles).toEqual([]);
  expect(caseTaskStepIndex(second.state)).toBe(2);
});

it('the captured v1 checkpoint resumes the original contract without replanning', async () => {
  const f = fixture();
  const result = await f.task.step(legacy.binding, structuredClone(legacy.state), new AbortController().signal);
  expect(result.state.version).toBe(1);
  expect(result.state.contractHash).toBe(legacy.state.contractHash);
  expect(f.roles).toEqual(['matter-analyst']);
});

it('changed graph dependencies or results are rejected before dispatch', async () => {
  const f = fixture();
  const first = await f.step();
  const second = await f.step(first.state);
  const corrupt = structuredClone(second.state) as any;
  expect(corrupt.graph).toBeDefined();
  corrupt.graph.nodes.find((n: any) => n.role === 'matter-analyst').dependsOn.push('not-a-node');
  const resumed = fixture();
  await expect(resumed.step(corrupt)).rejects.toThrow('TASK_GRAPH_CONFLICT');
  expect(resumed.roles).toHaveLength(0);
  const tampered = structuredClone(second.state) as any;
  tampered.outputs['matter-analyst'].claims.push({
    id: 'injected',
    classification: 'INFERENCE',
    statement: 'Injected',
    sourceIds: [],
  });
  await expect(resumed.step(tampered)).rejects.toThrow('TASK_GRAPH_CONFLICT');
});

it('resume does not silently expand the pinned tool manifest', async () => {
  const f = fixture();
  const first = await f.step();
  const resumed = fixture({ tools: [researchTool] });
  await expect(resumed.step(first.state)).rejects.toThrow('TASK_CAPABILITY_CONFLICT');
  expect(resumed.roles).toHaveLength(0);
});

it('a question cannot persist an oversized graph checkpoint', async () => {
  const f = fixture({
    plan: {
      ...plan,
      issues: Array.from({ length: 30 }, (_, i) => ({
        id: `issue-${i}`,
        statement: 'x'.repeat(8000),
        sourceIds: ['user:graph'],
      })),
      gaps: [
        {
          key: 'purpose',
          kind: 'MISSING',
          material: true,
          prompt: 'Qual finalidade?',
          reason: 'Delimitar',
          sourceIds: [],
          options: [],
        },
      ],
    },
  });
  await expect(f.finish()).rejects.toThrow('TASK_CONTEXT_LIMIT');
});

it('compares the same explicit conflict against the captured sequential contract', async () => {
  const output = (role: string) =>
    role === 'matter-analyst'
      ? {
          ...empty(),
          claims: [
            {
              id: 'conflict',
              classification: 'CONFLICT',
              statement: 'Relatos incompatíveis.',
              sourceIds: ['user:graph'],
            },
          ],
        }
      : {
          ...empty(),
          findings: [
            {
              id: 'conflict-review',
              code: 'CONFLICT_UNRESOLVED',
              severity: 'BLOCKING',
              statement: 'A contradição permanece sem resolução no material sintético.',
              sourceIds: ['user:graph'],
            },
          ],
        };
  const before = fixture({ output });
  const oldResult = await before.finish(structuredClone(legacy.state));
  const after = fixture({ output });
  const newResult = await after.finish();
  expect(before.roles).toEqual(['matter-analyst']);
  expect(after.roles).toEqual(['legal-orchestrator', 'matter-analyst', 'adversarial-reviewer']);
  expect(before.deliveries[0].status).toBe('CANDIDATE');
  expect(after.deliveries[0].status).toBe('LIMITED');
  const metrics = (result: any, delivery: any) => ({
    roleRuns: result.state.profiles.length,
    syntheticToolCalls: result.state.toolCount,
    deliveryStatus: delivery.status,
    findings: delivery.findings.map((f: any) => f.code),
    checkpointBytes: Buffer.byteLength(JSON.stringify(result.state)),
  });
  if (process.env.FORGELEX_GRAPH_BENCHMARK === 'true')
    writeFileSync(
      'docs/architecture/evidence/2026-11-01-adaptive-graph-comparison.json',
      JSON.stringify(
        {
          date: '2026-11-01',
          scenario: 'Explicit conflict discovered after planning in a simple analysis',
          legacyContractHash: legacy.state.contractHash,
          sameContextAndSpecialistOutputs: true,
          baselinePlannerAlreadyCommittedInFixture: true,
          before: metrics(oldResult, before.deliveries[0]),
          after: metrics(newResult, after.deliveries[0]),
          realModelCalls: 0,
          measuredModelTokens: null,
          measuredModelCost: null,
          limitation: 'Deterministic routing/control comparison only; no measured legal-semantic quality improvement.',
        },
        null,
        2,
      ) + '\n',
    );
});

it('refuses to replay downstream work for a research tool that is not available', async () => {
  const f = fixture({
    plan: { ...plan, action: 'review_text', requiresCaseLaw: true },
    output: (role) =>
      role === 'adversarial-reviewer' ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH')] } : empty(),
  });
  await f.finish();
  expect(f.roles.filter((r) => r === 'adversarial-reviewer')).toHaveLength(1);
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'DEPENDENCY_UNRESOLVED' }));
});

it('rejects an altered node input hash and an illegally skipped terminal verifier', async () => {
  const text = 'Fonte sintética';
  const source = { id: 'legal', kind: 'AUTHORITY', text, contentHash: createHash('sha256').update(text).digest('hex') };
  const f = fixture({ sources: [source] });
  const first = await f.step();
  const second = await f.step(first.state);
  const corrupted = structuredClone(second.state) as any;
  corrupted.graph.nodes.find((n: any) => n.role === 'matter-analyst').inputHash = 'a'.repeat(64);
  const resumed = fixture({ sources: [source] });
  await expect(resumed.step(corrupted)).rejects.toThrow('TASK_GRAPH_CONFLICT');
  const skipped = structuredClone(second.state) as any;
  skipped.graph.nodes.find((n: any) => n.role === 'authority-verifier').status = 'SKIPPED';
  await expect(resumed.step(skipped)).rejects.toThrow('TASK_GRAPH_CONFLICT');
  expect(resumed.roles).toHaveLength(0);
});

it('a checkpoint missing its committed plan cannot replay the planner', async () => {
  const f = fixture();
  const first = await f.step();
  const state = structuredClone(first.state) as any;
  delete state.plan;
  const resumed = fixture();
  await expect(resumed.step(state)).rejects.toThrow('TASK_GRAPH_CONFLICT');
  expect(resumed.roles).toHaveLength(0);
});

it('a missing normative tool cannot be substituted by an available case-law tool', async () => {
  const f = fixture({
    plan: { ...plan, action: 'review_text', requiresCaseLaw: true },
    tools: [researchTool],
    output: (role) =>
      role === 'adversarial-reviewer' ? { ...empty(), capabilityRequests: [request('NORM_RESEARCH')] } : empty(),
  });
  await f.finish();
  expect(f.roles.filter((r) => r === 'legal-researcher')).toHaveLength(1);
  expect(f.roles.filter((r) => r === 'adversarial-reviewer')).toHaveLength(1);
  expect(f.deliveries[0].findings).toContainEqual(expect.objectContaining({ code: 'DEPENDENCY_UNRESOLVED' }));
});

it('failed case-law research does not block an independent first normative query', async () => {
  let caseCalls = 0,
    normCalls = 0;
  const failing = {
    ...researchTool,
    execute: async () => {
      caseCalls++;
      throw new Error('SOURCE_OFFLINE');
    },
  };
  const normative = {
    ...researchTool,
    name: 'research.get_legislation',
    outputSchema: z.object({ status: z.literal('LIMITED'), reason: z.string() }),
    execute: async () => {
      normCalls++;
      return { success: true, data: { status: 'LIMITED' as const, reason: 'SYNTHETIC_SNAPSHOT_ABSENT' } };
    },
  };
  const f = fixture({
    plan: { ...plan, action: 'review_text', requiresCaseLaw: true },
    tools: [failing, normative],
    steps: (role, visit) =>
      role === 'legal-researcher' ? [{ name: visit === 1 ? failing.name : normative.name, input: {} }] : [],
    output: (role, visit) =>
      role === 'adversarial-reviewer' && visit === 1
        ? { ...empty(), capabilityRequests: [request('CASE_LAW_RESEARCH'), request('NORM_RESEARCH')] }
        : empty(),
  });
  const result = await f.finish();
  expect(caseCalls).toBe(1);
  expect(normCalls).toBe(1);
  expect((result.state as any).graph.failedTools).toContain('research.search_case_law');
  expect(
    f.packets
      .filter((p: any) => p.routing?.nodeId === 'legal-researcher:1')[0]
      .routing.requests.map((r: any) => r.capability),
  ).toEqual(['NORM_RESEARCH']);
});
