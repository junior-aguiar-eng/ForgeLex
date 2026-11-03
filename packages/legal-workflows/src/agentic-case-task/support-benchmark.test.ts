import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeAgentProvider } from '@forgelex/agent-core';
import type { AgenticTaskDelivery, TaskBinding, TaskSource } from '@forgelex/domain';
import type { TaskSpecialistResult } from '@forgelex/legal-agents';
import { AgenticCaseTask } from './case-task.js';

// Synthetic evidence only: none of these passages represents a statute or judgment.
const text = 'Registro sintético: o documento menciona entrega parcial; não confirma pagamento.';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const contexts: { id: string; source: TaskSource }[] = [
  {
    id: 'verified-syllabus',
    source: {
      id: 's',
      kind: 'AUTHORITY',
      text,
      contentHash: hash(text),
      extent: 'SYLLABUS',
      identityStatus: 'VERIFIED_OFFICIAL',
    },
  },
  {
    id: 'unverified-index',
    source: {
      id: 's',
      kind: 'AUTHORITY',
      text,
      contentHash: hash(text),
      extent: 'SYLLABUS',
      identityStatus: 'INDEX_CANDIDATE',
    },
  },
  {
    id: 'truncated-excerpt',
    source: {
      id: 's',
      kind: 'AUTHORITY',
      text,
      contentHash: hash(text),
      extent: 'EXCERPT',
      identityStatus: 'VERIFIED_PROVIDER',
    },
  },
  {
    id: 'norm-version-1',
    source: {
      id: 's',
      kind: 'NORM',
      text,
      contentHash: hash(text),
      extent: 'PROVISION',
      versionId: 'v1',
      identityStatus: 'CURATED_SNAPSHOT_NOT_APPLICABILITY',
    },
  },
  {
    id: 'norm-version-2',
    source: {
      id: 's',
      kind: 'NORM',
      text: `Versão distinta. ${text}`,
      contentHash: hash(`Versão distinta. ${text}`),
      extent: 'PROVISION',
      versionId: 'v2',
      identityStatus: 'CURATED_SNAPSHOT_NOT_APPLICABILITY',
    },
  },
];
const cases = [
  { id: 'literal-supported', kind: 'POSITIVE', unsupported: false },
  { id: 'partial', kind: 'AMBIGUOUS', unsupported: true },
  { id: 'none', kind: 'NEGATIVE', unsupported: true },
  { id: 'undetermined', kind: 'AMBIGUOUS', unsupported: true },
  { id: 'missing-check', kind: 'NEGATIVE', unsupported: true },
  { id: 'invented-quote', kind: 'ADVERSARIAL', unsupported: true },
  { id: 'conflicting-checks', kind: 'ADVERSARIAL', unsupported: true },
  { id: 'duplicate-checks', kind: 'ADVERSARIAL', unsupported: true },
  { id: 'unknown-source', kind: 'ADVERSARIAL', unsupported: false, invalid: true },
  { id: 'unknown-claim', kind: 'ADVERSARIAL', unsupported: false, invalid: true },
  { id: 'uncited-source', kind: 'NEGATIVE', unsupported: false, invalid: true },
  { id: 'late-drafter-claim', kind: 'MULTISTEP', unsupported: false },
] as const;
const measurements: unknown[] = [];
afterAll(() => {
  if (process.env.FORGELEX_SUPPORT_BENCHMARK_REPORT)
    writeFileSync(
      process.env.FORGELEX_SUPPORT_BENCHMARK_REPORT,
      JSON.stringify(
        {
          methodology: 'Deterministic synthetic handoffs; no model inference or semantic legal quality measurement.',
          scenarios: measurements,
        },
        null,
        2,
      ),
    );
});

for (const context of contexts)
  for (const scenario of cases) {
    it(`support-benchmark/${context.id}/${scenario.id}`, async () => {
      const start = performance.now();
      const late = scenario.id === 'late-drafter-claim';
      const binding: TaskBinding = {
        tenantId: 'synthetic-tenant',
        userId: 'synthetic-user',
        executionId: 'e',
        conversationId: 'c',
        contextRevision: 1,
        objective: 'Examinar relato sintético',
        actionId: late ? 'create_document' : 'analyze_documents',
      };
      const norm = context.source.kind === 'NORM';
      const sourceId = norm ? `norm:${hash(JSON.stringify(['fixture', 'article', context.source.versionId]))}` : 's';
      const toolName = norm ? 'research.get_legislation' : 'research.search_case_law';
      const plan = {
        action: binding.actionId,
        requiresCaseLaw: !norm,
        requiresNorms: norm,
        requiresProcedure: false,
        documentPurpose: 'LEGAL_DOCUMENT',
        documentType: 'Registro',
        issues: [{ id: 'i', statement: 'O que está registrado?', sourceIds: ['user'] }],
        gaps: [],
      };
      const claim = {
        id: 'claim',
        classification: 'INFERENCE' as const,
        statement: 'O registro menciona entrega parcial.',
        sourceIds: [sourceId],
      };
      const empty = (): TaskSpecialistResult => ({
        coveredIssueIds: ['i'],
        claims: [],
        requirements: [],
        findings: [],
        supportChecks: [],
      });
      let delivery: AgenticTaskDelivery | undefined;
      const roles: string[] = [];
      const task = new AgenticCaseTask({
        context: {
          load: async () => ({
            contextId: 'c',
            contextRevision: 1,
            sources: [
              {
                id: 'user',
                kind: 'USER_TEXT',
                text: 'Examinar entrega parcial.',
                contentHash: hash('Examinar entrega parcial.'),
              },
              { ...context.source, id: 'other' },
            ],
            answers: [],
          }),
          assert: async () => {},
          save: async (_binding, value) => {
            delivery = value;
            return { id: 'delivery:e' };
          },
        },
        tools: [
          {
            name: toolName,
            description: 'Synthetic retrieval, no network.',
            impactLevel: 'L0_OBSERVATION',
            inputSchema: z.strictObject({}),
            outputSchema: z.any(),
            execute: async () => ({
              success: true,
              data: norm
                ? {
                    status: 'FOUND',
                    document: {
                      normId: 'fixture',
                      provisionId: 'article',
                      versionId: context.source.versionId,
                      text: context.source.text,
                      officialUrl: 'https://example.invalid/synthetic',
                    },
                  }
                : {
                    status: context.source.identityStatus,
                    items: [
                      {
                        id: 's',
                        syllabus: context.source.extent === 'EXCERPT' ? `${text}${'x'.repeat(16000)}` : text,
                        versionId: context.source.versionId,
                      },
                    ],
                  },
            }),
          },
        ],
        createProvider: ({ role, registry, packet }) => {
          roles.push(role);
          const output = empty();
          if (role === (late ? 'legal-drafter' : 'legal-researcher')) output.claims = [claim];
          if (role === 'legal-drafter')
            output.document = {
              title: 'Registro',
              documentType: 'Registro',
              sections: [{ title: 'Relato', content: claim.statement, sourceIds: [sourceId] }],
            };
          if (role === 'authority-verifier') {
            const available = Object.values(packet.priorResults).flatMap((result) => result.claims);
            const check = { claimId: available[0].id, sourceId, quote: text, assessment: 'SUPPORTED' as const };
            output.supportChecks = [check];
            switch (scenario.id) {
              case 'partial':
                output.supportChecks = [{ ...check, assessment: 'PARTIAL' }];
                break;
              case 'none':
                output.supportChecks = [{ ...check, assessment: 'NONE' }];
                break;
              case 'undetermined':
                output.supportChecks = [{ ...check, assessment: 'UNDETERMINED' }];
                break;
              case 'missing-check':
                output.supportChecks = [];
                break;
              case 'invented-quote':
                output.supportChecks = [{ ...check, quote: 'Trecho fabricado, ausente do documento.' }];
                break;
              case 'conflicting-checks':
                output.supportChecks = [check, { ...check, assessment: 'NONE' }];
                break;
              case 'duplicate-checks':
                output.supportChecks = [check, check];
                break;
              case 'unknown-source':
                output.supportChecks.push({ ...check, sourceId: 'missing' });
                break;
              case 'unknown-claim':
                output.supportChecks.push({ ...check, claimId: 'missing' });
                break;
              case 'uncited-source':
                output.supportChecks.push({ ...check, sourceId: 'other' });
                break;
            }
          }
          return new FakeAgentProvider(registry, undefined, [
            ...(role === 'legal-researcher' ? [{ toolCall: { name: toolName, input: {} } }] : []),
            {
              toolCall: {
                name: 'task.submit',
                input: (role === 'legal-orchestrator' ? plan : output) as unknown as Record<string, unknown>,
              },
            },
          ]);
        },
      });
      let state;
      let rejected: unknown;
      try {
        for (let i = 0; i < 10; i++) {
          // Serialize each boundary: exercises actual checkpoint parsing, not shared object reuse.
          const result = await task.step(binding, state, new AbortController().signal);
          state = JSON.parse(JSON.stringify(result.state));
          if (result.kind === 'completed') break;
        }
      } catch (error) {
        rejected = error;
      }
      if (
        ['conflicting-checks', 'duplicate-checks', 'unknown-source', 'unknown-claim', 'uncited-source'].includes(
          scenario.id,
        )
      ) {
        expect(rejected).toBeInstanceOf(Error);
        expect((rejected as Error).message).toMatch(/^(SUPPORT_CHECK_INVALID|INVALID_CANONICAL_STATE)$/);
        expect(delivery).toBeUndefined();
        measurements.push({
          id: `${context.id}/${scenario.id}`,
          kind: scenario.kind,
          passed: true,
          outcome: 'rejected-invalid-handoff',
          code: (rejected as Error).message,
          roles,
          modelCalls: 0,
        });
        return;
      }
      expect(rejected).toBeUndefined();
      const codes = delivery?.findings.map((finding) => finding.code) ?? [];
      const supportedCorrectly = codes.includes('CITATION_WITHOUT_SUPPORT') === scenario.unsupported;
      const invalidCorrectly = !('invalid' in scenario) || codes.includes('SUPPORT_CHECK_INVALID');
      measurements.push({
        id: `${context.id}/${scenario.id}`,
        kind: scenario.kind,
        passed: Boolean(delivery) && supportedCorrectly && invalidCorrectly,
        roles,
        toolCount: state?.toolCount,
        durationMs: performance.now() - start,
        provider: 'fake',
        modelCalls: 0,
        tokens: null,
        cost: null,
        codes,
      });
      expect(delivery).toBeDefined();
      expect(supportedCorrectly, 'unsupported/ambiguous pairs must be limited; later claims must reach verifier').toBe(
        true,
      );
      expect(invalidCorrectly, 'orphan/unlinked checks must produce an explicit limitation').toBe(true);
      expect(delivery?.legalAssessment).toBe('NOT_EVALUATED');
      expect(delivery?.humanReviewRequired).toBe(true);
      if (context.id === 'unverified-index') expect(codes).toContain('AUTHORITY_IDENTITY_UNCONFIRMED');
      if (context.source.kind === 'NORM') expect(codes).toContain('LEGAL_APPLICABILITY_NOT_EVALUATED');
    });
  }
