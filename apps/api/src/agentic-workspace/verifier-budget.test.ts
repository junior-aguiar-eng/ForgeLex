import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { NativeTaskPacketSchema } from '@forgelex/domain';
import { AgenticCaseTask } from '@forgelex/legal-workflows';
import { createCommercialOpenAIRuntime } from './commercial-provider.js';

const root = 'docs/architecture/evidence/2026-11-02-scoped-handoff-v7/real/';
const read = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const historical = read('D04-create-candidate.checkpoint.json');
const recorded = read('D04-create-candidate.json');
const corpus = read('packet.json').corpus;
const scenario = corpus.scenarios.find((s: any) => s.id === 'D04-create');
const dossier = corpus.dossiers.find((d: any) => d.id === scenario.dossierId);
const source = (id: string, kind: string, text: string, extra = {}) => ({
  id,
  kind,
  text,
  contentHash: hash(text),
  ...extra,
});
const packet = NativeTaskPacketSchema.parse({
  contextId: scenario.id,
  contextRevision: 1,
  answers: [],
  sources: [
    source('context', 'USER_TEXT', dossier.context),
    ...dossier.documents.map(([id, text]: string[]) =>
      source(
        `${dossier.id}/${id}@v1#p1`,
        id === 'relato' ? 'USER_TEXT' : 'DOCUMENT',
        text,
        id === 'relato' ? {} : { documentId: `${dossier.id}/${id}`, versionId: 'v1', extent: 'SELECTED_TEXT' },
      ),
    ),
    ...corpus.sources
      .filter((s: any) => dossier.sourceIds.includes(s.id))
      .map((s: any) =>
        source(s.id, s.id.startsWith('CPC') ? 'NORM' : 'AUTHORITY', s.text, {
          url: s.url,
          versionId: s.retrievedAt,
          extent: 'EXCERPT',
          identityStatus: 'OFFICIAL_EXCERPT',
        }),
      ),
  ],
});
const binding = {
  tenantId: 'evaluation-synthetic-only',
  userId: 'boni-evaluation',
  executionId: recorded.runId,
  conversationId: scenario.id,
  contextRevision: 1,
  objective: recorded.request,
  actionId: 'create_document' as const,
};
afterEach(() => vi.unstubAllGlobals());

function response(result: unknown) {
  const item = {
    type: 'function_call',
    id: 'f1',
    call_id: 'c1',
    name: 'forgelex_task_submit',
    status: 'completed',
    arguments: JSON.stringify(result),
  };
  const value = {
    id: 'response',
    object: 'response',
    model: 'gpt-6.1-sol',
    status: 'completed',
    output: [item],
    usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200, input_tokens_details: { cached_tokens: 0 } },
  };
  const frames = [
    { type: 'response.created', response: { ...value, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: value },
  ];
  return new Response(
    frames
      .map((f, sequence_number) => `event: ${f.type}\ndata: ${JSON.stringify({ ...f, sequence_number })}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

// Recreate the original local IDs so the server scopes the same recorded output again.
function localOutput(role: string) {
  const value = structuredClone(historical.outputs[role]);
  const prefix = hash(JSON.stringify(`${role}:0`)).slice(0, 10) + ':';
  for (const field of ['claims', 'requirements', 'findings'])
    value[field] = value[field].map((item: any) => ({
      ...item,
      id: item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id,
    }));
  return value;
}

async function replay(legacy: boolean, spent = 100930, checks = true) {
  vi.stubGlobal('fetch', () => {
    throw new Error('NETWORK_FORBIDDEN');
  });
  expect(hash(JSON.stringify(packet))).toBe(recorded.inputHash);
  const reservations: number[] = [];
  let input: any,
    delivery: any,
    dispatches = 0,
    originalOutputs: any;
  const runtime = createCommercialOpenAIRuntime({
    apiKey: 'synthetic-only',
    assertContext: async () => binding,
    finance: {
      authorizeCall: async (_o: any, _e: any, call: any) => {
        reservations.push(call.upperBoundMicroUsd);
        if (spent + call.upperBoundMicroUsd > 250000) throw new Error('BUDGET_EXCEEDED');
        return { shouldExecute: true };
      },
      settleCall: async () => ({ status: 'SETTLED' }),
      markUncertain: async () => {
        throw new Error('UNEXPECTED_UNCERTAINTY');
      },
      markNotDispatched: async () => {},
    } as any,
    transport: async () => {
      dispatches++;
      return response({
        coveredIssueIds: historical.plan.issues.map((i: any) => i.id),
        claims: [],
        requirements: [],
        findings: [],
        supportChecks: checks
          ? input.packet.supportTargets.map((t: any) => ({
              ...t,
              quote: packet.sources.find((s) => s.id === t.sourceId)!.text,
              assessment: 'PARTIAL',
            }))
          : [],
      });
    },
  });
  const task = new AgenticCaseTask({
    tools: [],
    context: {
      load: async () => packet,
      assert: async () => {},
      save: async (_b, d) => {
        delivery = d;
        return { id: 'offline-only' };
      },
    },
    authorizeRealProvider: runtime.authorizeRealProvider,
    createProvider: (value) => {
      if (value.role === 'authority-verifier') {
        input = value;
        return runtime.createProvider(value);
      }
      return new FakeAgentProvider(value.registry, undefined, [
        {
          toolCall: {
            name: 'task.submit',
            input: value.role === 'legal-orchestrator' ? historical.plan : localOutput(value.role),
          },
        },
      ]);
    },
  });
  let state = legacy ? structuredClone(historical) : undefined;
  let error: any;
  try {
    for (let i = 0; i < 10; i++) {
      if (state?.outputs['adversarial-reviewer'] && !originalOutputs) originalOutputs = structuredClone(state.outputs);
      const step = await task.step(binding, state, new AbortController().signal);
      state = step.state;
      if (step.kind !== 'checkpoint') break;
    }
  } catch (e) {
    error = e;
  }
  return { reservations, error, input, state, delivery, dispatches, originalOutputs };
}

it('reproduces the historical D04 reserve rejection without dispatching', async () => {
  const r = await replay(true);
  expect(r.reservations).toEqual([182612]);
  expect(r.dispatches).toBe(0);
  expect(r.delivery).toBeUndefined();
  expect(r.error.diagnostic).toMatchObject({ failureCode: 'BUDGET_EXCEEDED', role: 'authority-verifier' });
});

it('fits recorded D04 inside the unchanged budget and retains all original conclusions in the delivery', async () => {
  const r = await replay(false);
  if (process.env.FORGELEX_D04_BUDGET_REPORT)
    writeFileSync(
      process.env.FORGELEX_D04_BUDGET_REPORT,
      JSON.stringify(
        {
          legacyReservationMicroUsd: 182612,
          candidateReservationsMicroUsd: r.reservations,
          initialSpentMicroUsd: 100930,
          capMicroUsd: 250000,
          paidModelCalls: 0,
          syntheticVerifierCalls: r.dispatches,
          requestBytes: (r.reservations[0] - 36864) / 4,
        },
        null,
        2,
      ),
    );
  expect(r.originalOutputs).toEqual(historical.outputs);
  expect(r.reservations).toHaveLength(1);
  expect(r.reservations[0] + 100930).toBeLessThanOrEqual(250000);
  expect(r.error).toBeUndefined();
  expect(r.dispatches).toBe(1);
  expect(r.input.packet.sources).toEqual(packet.sources);
  expect(r.input.packet.plan).toEqual(historical.plan);
  for (const [role, original] of Object.entries(historical.outputs) as [string, any][]) {
    expect(r.input.packet.priorResults[role].claims).toEqual(original.claims);
    expect(r.input.packet.priorResults[role].coveredIssueIds).toEqual(original.coveredIssueIds);
    expect(r.input.packet.priorResults[role].document).toEqual(original.document);
    expect(r.state.outputs[role]).toEqual(original);
    for (const item of original.findings) expect(r.delivery.findings).toContainEqual(item);
    for (const item of original.requirements) expect(r.delivery.requirements).toContainEqual(item);
  }
  expect(r.delivery.document).toEqual(historical.outputs['legal-drafter'].document);
  expect(r.delivery.status).toBe('LIMITED');
  expect(r.delivery.humanReviewRequired).toBe(true);
  expect(r.delivery.supportAudit).toHaveLength(5);
  expect(
    r.delivery.supportAudit.every((x: any) => x.modelAssessment === 'PARTIAL' && x.quoteStatus === 'MATCHED'),
  ).toBe(true);
  expect(r.delivery.findings).toContainEqual(expect.objectContaining({ code: 'CITATION_WITHOUT_SUPPORT' }));
});

it('continues blocking when the remaining budget cannot reserve even the focused verifier', async () => {
  const r = await replay(false, 240000);
  expect(r.dispatches).toBe(0);
  expect(r.delivery).toBeUndefined();
  expect(r.error.diagnostic).toMatchObject({ failureCode: 'BUDGET_EXCEEDED' });
});

it('does not promote an absent support check to supported after the context reduction', async () => {
  const r = await replay(false, 100930, false);
  expect(r.error).toBeUndefined();
  expect(r.delivery.supportAudit).toHaveLength(5);
  expect(
    r.delivery.supportAudit.every((x: any) => x.modelAssessment === 'NOT_ASSESSED' && x.quoteStatus === 'MISSING'),
  ).toBe(true);
  expect(r.delivery.status).toBe('LIMITED');
  expect(r.delivery.findings).toContainEqual(expect.objectContaining({ code: 'CITATION_WITHOUT_SUPPORT' }));
});
