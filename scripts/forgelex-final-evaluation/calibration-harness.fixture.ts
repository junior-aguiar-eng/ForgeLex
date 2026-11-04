// Invoked only by calibrate.mjs with snapshot-specific aliases and isolated synthetic inputs.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { AgenticCaseTask } from '@forgelex/legal-workflows';
import { NativeTaskPacketSchema } from '@forgelex/domain';
import { COMMERCIAL_POLICY } from '@forgelex/billing-ledger';
// Evaluation instrumentation uses the current sanitizer even when the engine aliases point to v1.
import { safeAgentFailureDetails } from '../../packages/agent-core/src/runtime/agent-failure.js';
// @ts-expect-error Alias supplied by the isolated evaluation config, never a product import.
import { createCommercialOpenAIRuntime } from '@evaluation/provider';
import { EvaluationBudget } from './budget.mjs';
import { assertV9Packet } from './v9-campaign.mjs';
import { assertContinuationPacket } from './v9-continuation.mjs';
import { assertFinalizationPacket } from './v9-finalization.mjs';

const sha = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const configPath = process.env.FORGELEX_EVALUATION_CONFIG;

it.skipIf(!configPath)(
  'executes the three calibration inputs on the pinned engine with shared durable budget',
  async () => {
    const config = JSON.parse(readFileSync(configPath!, 'utf8'));
    const packet = JSON.parse(readFileSync(config.packetPath, 'utf8'));
    expect(sha(readFileSync(config.packetPath, 'utf8'))).toBe(config.packetSha256);
    expect(COMMERCIAL_POLICY).toMatchObject({
      model: 'gpt-6.1-sol',
      inputMicroUsdPerMillion: 2000000,
      outputMicroUsdPerMillion: 10000000,
      cachedInputMicroUsdPerMillion: 100000,
      maxInferenceMicroUsd: 250000,
      maxCalls: 24,
      maxOutputTokens: 2048,
      maxDurationMs: 300000,
    });
    const real = config.mode === 'real';
    const v9 = config.workflowVersion === 9;
    const continuation = v9 && Boolean(packet.continuation);
    if (packet.finalization) assertFinalizationPacket(packet);
    else if (continuation) assertContinuationPacket(packet);
    else if (v9) assertV9Packet(packet);
    const approval = packet.finalization
      ? 'boni-v9-finalize-usd-1.50'
      : continuation
        ? 'boni-v9-resume-usd-1.50'
        : v9
          ? 'boni-v9-usd-1.50-reserve-0.083620'
          : 'boni-calibration-usd-1.50';
    if (!['fake', 'real'].includes(config.mode) || (real && process.env.FORGELEX_EVALUATION_APPROVAL !== approval))
      throw new Error('EVALUATION_NOT_APPROVED');
    const wireFetch = globalThis.fetch;
    vi.stubGlobal('fetch', () => {
      throw new Error('UNAUTHORIZED_NETWORK');
    });
    const budget = new EvaluationBudget({
      directory: config.campaign,
      fingerprint: config.fingerprint,
      runIds: config.runIds,
      cap: v9 ? packet.newCallsCapMicroUsd : 1500000,
      ...(continuation
        ? { runCap: packet.limits.perExecutionCapMicroUsd, runLimits: packet.continuation.runLimits }
        : {}),
    });
    try {
      for (const entry of packet.runs.filter(
        (run: any) => run.phase === 'calibration' && run.variant === config.variant && run.id === config.runId,
      )) {
        const outputPath = join(config.campaign, `${entry.id}.json`);
        if (budget.state.runs[entry.id]) {
          if (budget.state.runs[entry.id].status === 'active' || budget.summary().unresolved)
            throw new Error('EVALUATION_RECONCILIATION_REQUIRED');
          // Resuming a completed or failed place never repeats it. Missing artifact needs inspection.
          JSON.parse(readFileSync(outputPath, 'utf8'));
          continue;
        }
        const scenario = packet.corpus.scenarios.find((item: any) => item.id === entry.scenarioId);
        const dossier = packet.corpus.dossiers.find((item: any) => item.id === scenario.dossierId);
        const source = (id: string, kind: string, text: string, extra = {}) => ({
          id,
          kind,
          text,
          contentHash: sha(text),
          ...extra,
        });
        const selected = NativeTaskPacketSchema.parse({
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
            ...packet.corpus.sources
              .filter((item: any) => dossier.sourceIds.includes(item.id))
              .map((item: any) =>
                source(item.id, item.id.startsWith('CPC') ? 'NORM' : 'AUTHORITY', item.text, {
                  url: item.url,
                  versionId: item.retrievedAt,
                  extent: 'EXCERPT',
                  identityStatus: 'OFFICIAL_EXCERPT',
                }),
              ),
            ...(scenario.draft
              ? [source('draft', 'DRAFT', scenario.draft, { documentId: 'draft', versionId: 'v1' })]
              : []),
          ],
        });
        const inputHash = sha(selected);
        const binding = {
          tenantId: 'evaluation-synthetic-only',
          userId: 'boni-evaluation',
          executionId: entry.id,
          conversationId: scenario.id,
          contextRevision: 1,
          objective: `${scenario.request} Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.`,
          actionId: v9
            ? scenario.action
            : ({ analyze: 'analyze_documents', create: 'create_document', review: 'review_text' } as const)[
                scenario.action as 'analyze' | 'create' | 'review'
              ],
        };
        const owner = { tenantId: binding.tenantId, userId: binding.userId };
        const controller = new AbortController();
        const roles: string[] = [];
        let delivery: any, state: any, result: any;
        const resuming = continuation && entry.id === (packet.continuation.resumeRunId ?? 'D04-V2');
        if (resuming) {
          const checkpointBytes = readFileSync(packet.continuation.checkpointPath, 'utf8');
          expect(sha(checkpointBytes)).toBe(packet.continuation.checkpointSha256);
          state = JSON.parse(checkpointBytes);
        }
        let diagnostic: unknown = null;
        let outcome = 'failed',
          error: string | null = null,
          dispatched = 0;
        const finance = {
          authorizeCall: async (received: any, id: string, call: any) => {
            expect(received).toEqual(owner);
            if (id !== entry.id) throw new Error('RUN_NOT_ALLOWED');
            return { shouldExecute: budget.reserve(id, call.callId, call.upperBoundMicroUsd) };
          },
          settleCall: async (received: any, id: string, callId: string, usage: any) => {
            expect(received).toEqual(owner);
            if (id !== entry.id) throw new Error('RUN_NOT_ALLOWED');
            const cached = usage.cachedInputTokens ?? 0;
            const microUsd = Number(
              (BigInt(usage.inputTokens - cached) * BigInt(COMMERCIAL_POLICY.inputMicroUsdPerMillion) +
                BigInt(cached) * BigInt(COMMERCIAL_POLICY.cachedInputMicroUsdPerMillion) +
                BigInt(usage.outputTokens) * BigInt(COMMERCIAL_POLICY.outputMicroUsdPerMillion) +
                999999n) /
                1000000n,
            );
            budget.settle(id, callId, microUsd, usage);
            return { status: 'SETTLED' };
          },
          markUncertain: async (_owner: any, id: string, call: string) => budget.uncertain(id, call),
          markNotDispatched: async (_owner: any, id: string, call: string) => budget.void(id, call),
        };
        const runtime = createCommercialOpenAIRuntime({
          apiKey: real ? process.env.OPENAI_API_KEY : 'synthetic-evaluation-no-network',
          recordCall: async (event: unknown) => {
            const fd = openSync(join(config.campaign, 'call-trace.jsonl'), 'a');
            try {
              const bytes = Buffer.from(JSON.stringify(event) + '\n');
              let offset = 0;
              while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
              fsyncSync(fd);
            } finally {
              closeSync(fd);
            }
          },
          finance,
          assertContext: async (id: string, snapshot?: unknown) => {
            if (id !== entry.id || controller.signal.aborted) throw new Error('SESSION_CANCELLED');
            budget.assertActive(id);
            if (snapshot) {
              // The original provider passes the working packet; the current one passes selectedPacket.
              // Both must contain the same immutable selected context in this closed-corpus calibration.
              const value = snapshot as any;
              const selectedView = NativeTaskPacketSchema.parse({
                contextId: value.contextId,
                contextRevision: value.contextRevision,
                sources: value.sources,
                answers: value.answers,
              });
              if (sha(selectedView) !== inputHash) throw new Error('CONTEXT_CHANGED');
            }
            return owner;
          },
          transport: async (url: any, init: any) => {
            if (
              controller.signal.aborted ||
              String(url) !== 'https://api.openai.com/v1/responses' ||
              !budget.summary().unresolved
            )
              throw new Error('DISPATCH_NOT_AUTHORIZED');
            dispatched++;
            if (real) return wireFetch(url, init);
            const body = JSON.parse(String(init.body));
            const role = JSON.parse(body.instructions.split('\n\n')[0]).profile.role;
            const user = body.input.find((item: any) => item.role === 'user');
            const context = JSON.parse(
              typeof user.content === 'string'
                ? user.content
                : user.content.find((item: any) => item.type === 'input_text').text,
            ).untrustedContext;
            const doc = selected.sources.find((item) => item.kind === 'DOCUMENT')!;
            const plan = {
              action: binding.actionId,
              requiresCaseLaw: false,
              requiresNorms: false,
              requiresProcedure: false,
              ...(binding.actionId === 'create_document'
                ? { documentPurpose: 'FACTUAL_RECORD', documentType: 'Registro sintético' }
                : {}),
              issues: [{ id: 'issue', statement: 'Examinar o material sintético', sourceIds: [doc.id] }],
              gaps:
                config.variant === 'candidate'
                  ? [
                      {
                        key: 'synthetic-limitation',
                        kind: 'MISSING',
                        material: true,
                        deliveryImpact: 'LIMITATION',
                        prompt: 'Informação não fornecida na simulação.',
                        reason: 'A simulação contém informação não fornecida; não concluir fatos adicionais.',
                        sourceIds: [doc.id],
                        options: [],
                      },
                    ]
                  : [],
            };
            const output: any = {
              coveredIssueIds: resuming ? state.plan.issues.map((issue: any) => issue.id) : ['issue'],
              claims: [],
              findings: [],
              requirements: [],
              supportChecks: [],
            };
            if (role === 'matter-analyst')
              output.claims = [{ id: 'claim', classification: 'ALLEGATION', statement: doc.text, sourceIds: [doc.id] }];
            if (role === 'legal-drafter')
              output.document = {
                title: 'Transporte sintético',
                documentType: 'Registro sintético',
                sections: [{ title: 'Material', content: doc.text, sourceIds: [doc.id] }],
              };
            if (role === 'authority-verifier')
              output.supportChecks = context.supportTargets
                ? context.supportTargets.map((target: any) => ({
                    ...target,
                    quote: context.sources.find((source: any) => source.id === target.sourceId).text,
                    assessment: 'SUPPORTED',
                  }))
                : Object.values(context.priorResults)
                    .flatMap((item: any) => item.claims)
                    .map((claim: any) => ({
                      claimId: claim.id,
                      sourceId: doc.id,
                      quote: doc.text,
                      assessment: 'SUPPORTED',
                    }));
            const submitted = body.input.some(
              (item: any) => item.type === 'function_call' && item.name === 'forgelex_task_submit',
            );
            const id = randomUUID();
            const items = submitted
              ? [
                  {
                    id: `msg_${id}`,
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [{ type: 'output_text', text: 'Registro sintético concluído.', annotations: [] }],
                  },
                ]
              : [
                  {
                    id: `fc_${id}`,
                    type: 'function_call',
                    status: 'completed',
                    call_id: `call_${id}`,
                    name: 'forgelex_task_submit',
                    arguments: JSON.stringify(role === 'legal-orchestrator' ? plan : output),
                  },
                ];
            const response = {
              id: `resp_${id}`,
              object: 'response',
              created_at: 1793664000,
              model: 'gpt-6.1-sol',
              service_tier: 'default',
              status: 'completed',
              output: items,
              usage: {
                input_tokens: 100,
                output_tokens: 20,
                total_tokens: 120,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
              parallel_tool_calls: false,
              tool_choice: 'auto',
              tools: body.tools,
            };
            const frames = [
              { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
              { type: 'response.output_item.added', output_index: 0, item: items[0] },
              { type: 'response.output_item.done', output_index: 0, item: items[0] },
              { type: 'response.completed', response },
            ];
            return new Response(
              frames
                .map(
                  (frame, sequence_number) =>
                    `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
                )
                .join(''),
              { headers: { 'content-type': 'text/event-stream' } },
            );
          },
        });
        budget.begin(entry.id);
        const timer = setTimeout(
          () => controller.abort(),
          continuation ? (packet.continuation.runLimits[entry.id]?.maxDurationMs ?? 300000) : 300000,
        );
        const started = performance.now();
        try {
          const task = new AgenticCaseTask({
            ...(v9 ? { workflowVersion: 9 as const } : {}),
            persistCheckpoint: async (_binding: unknown, checkpoint: unknown) => {
              writeFileSync(join(config.campaign, `${entry.id}.checkpoint.json`), JSON.stringify(checkpoint, null, 2));
            },
            context: {
              load: async () => structuredClone(selected),
              assert: async () => {
                budget.assertActive(entry.id);
                if (controller.signal.aborted) throw new Error('SESSION_CANCELLED');
              },
              save: async (_binding, value) => {
                delivery = value;
                return { id: `delivery:${entry.id}` };
              },
            },
            tools: [],
            createProvider: (input) => {
              roles.push(input.role);
              return runtime.createProvider(input);
            },
            authorizeRealProvider: runtime.authorizeRealProvider,
          });
          for (let step = 0; step < 30; step++) {
            result = await task.step(binding, state, controller.signal);
            state = JSON.parse(JSON.stringify(result.state));
            writeFileSync(join(config.campaign, `${entry.id}.checkpoint.json`), JSON.stringify(state, null, 2));
            if (result.kind !== 'checkpoint') {
              outcome = result.kind === 'completed' ? 'completed' : 'question';
              break;
            }
          }
        } catch (caught) {
          error = caught instanceof Error ? caught.message : 'EVALUATION_FAILED';
          const details = (caught as any)?.diagnostic;
          if (details) diagnostic = { ...safeAgentFailureDetails(details), role: roles.at(-1) };
        } finally {
          clearTimeout(timer);
          outcome = budget.finish(entry.id, outcome, { aborted: controller.signal.aborted });
        }
        const calls = Object.values(budget.state.runs[entry.id].calls) as any[];
        const output = {
          runId: entry.id,
          mode: config.mode,
          engine: config.engine,
          inputHash,
          request: binding.objective,
          outcome,
          error,
          diagnostic,
          durationMs: performance.now() - started,
          roles,
          stateVersion: state?.version,
          paidModelCalls: real ? dispatched : 0,
          syntheticCalls: real ? 0 : dispatched,
          measuredMicroUsd: real ? calls.reduce((sum, call) => sum + (call.actual ?? 0), 0) : null,
          simulatedMicroUsd: real ? null : calls.reduce((sum, call) => sum + (call.actual ?? 0), 0),
          uncertainUpperMicroUsd: calls
            .filter((call) => ['UNCERTAIN', 'RESERVED'].includes(call.status))
            .reduce((sum, call) => sum + call.upper, 0),
          usage: calls.filter((call) => call.status === 'SETTLED').map((call) => call.usage),
          delivery: delivery ?? null,
          question: result?.question ?? null,
          legalScore: null,
        };
        mkdirSync(config.campaign, { recursive: true });
        writeFileSync(outputPath, JSON.stringify(output, null, 2));
        if (!real) {
          expect(error, entry.id).toBeNull();
          expect(outcome, entry.id).toBe('completed');
          expect(dispatched).toBeGreaterThan(0);
          expect(delivery).toBeTruthy();
          if (resuming) {
            if (packet.finalization) expect(roles).toEqual(['authority-verifier']);
            expect(roles).not.toContain('legal-orchestrator');
            expect(roles).not.toContain('matter-analyst');
            expect(roles).not.toContain('procedural-advisor');
            expect(roles).not.toContain('legal-drafter');
          }
          expect(state.version).toBe(v9 ? 9 : config.variant === 'baseline' ? 1 : 8);
          if (config.variant === 'candidate') {
            expect(delivery.status).toBe('LIMITED');
            expect(delivery.findings).toContainEqual(expect.objectContaining({ code: 'DELIVERY_INFORMATION_LIMITED' }));
          }
        }
        if (budget.summary().unresolved) throw new Error('EVALUATION_RECONCILIATION_REQUIRED');
      }
    } finally {
      budget.close();
      vi.unstubAllGlobals();
    }
  },
  1000000,
);
