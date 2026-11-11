import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import type { AgenticTaskDelivery } from '@forgelex/domain';
import { AgenticCaseTask } from './case-task.js';

it('confere o marco documentado e mantém pendentes protocolo, fonte indireta e trecho divergente', async () => {
  const source = (id: string, kind: 'NORM' | 'DOCUMENT' | 'USER_TEXT', text: string) => ({
    id,
    kind,
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
  });
  const norm = {
    ...source('n', 'NORM', 'Na hipótese sintética, o marco é a audiência sem acordo.'),
    identityStatus: 'CURATED_SNAPSHOT_NOT_APPLICABILITY',
    versionId: 'v1',
    url: 'https://www.planalto.gov.br/',
  };
  const unidentifiedNorm = source('sem-proveniencia', 'NORM', norm.text);
  const document = source('d', 'DOCUMENT', 'Ata sintética. Audiência sem acordo em 09/11.');
  const certificate = source('c2', 'DOCUMENT', 'Certidão sintética. Procedimento comum.');
  const narrative = source('u', 'USER_TEXT', 'A parte disse que protocolou a peça.');
  const sources = [norm, unidentifiedNorm, document, certificate, narrative];
  const binding = {
    tenantId: 't',
    userId: 'u',
    executionId: 'e',
    conversationId: 'c',
    contextRevision: 1,
    objective: 'Elaborar contestação',
    actionId: 'create_document' as const,
  };
  const empty = { coveredIssueIds: ['i'], claims: [], requirements: [], findings: [], supportChecks: [] };
  const requirement = (id: string, statement: string, sourceIds = ['n', 'd']) => ({
    id,
    kind: 'PROCEDURAL',
    statement,
    sourceIds,
    verified: true,
  });
  let delivery: AgenticTaskDelivery | undefined;
  const task = new AgenticCaseTask({
    workflowVersion: 11,
    tools: [],
    context: {
      load: async () => ({ contextId: 'c', contextRevision: 1, sources, answers: [] }),
      assert: async () => {},
      save: async (_binding, value) => {
        delivery = value;
        return { id: 'saved' };
      },
    },
    createProvider: ({ registry, role, packet }) => {
      let input: Record<string, unknown> = empty;
      if (role === 'legal-orchestrator')
        input = {
          action: 'create_document',
          documentMode: 'CREATE',
          documentType: 'Contestação',
          requiresCaseLaw: false,
          requiresNorms: false,
          requiresProcedure: true,
          issues: [{ id: 'i', statement: 'Prazo', sourceIds: ['d'] }],
          gaps: [],
        };
      if (role === 'procedural-advisor')
        input = {
          ...empty,
          requirements: [
            requirement('marco', 'Audiência sem acordo no procedimento comum documentada como marco.', ['d']),
            requirement('prazo', 'O protocolo foi tempestivo.'),
            requirement('protocolo', 'A parte protocolou a contestação.', ['n', 'u']),
            requirement('juntada', 'Houve juntada dos documentos.'),
            requirement('conflito', 'O dia de protocolo está confirmado.'),
            requirement('repetido', 'A audiência consta da ata.'),
            requirement('repetido', 'O protocolo consta da ata.'),
            requirement('origem', 'A audiência é o marco segundo fonte oficial.'),
          ],
        };
      if (role === 'legal-drafter')
        input = {
          ...empty,
          document: {
            title: 'Contestação',
            documentType: 'Contestação',
            sections: [{ title: 'Fatos', content: 'A audiência terminou sem acordo.', sourceIds: ['d'] }],
          },
        };
      if (role === 'authority-verifier') {
        expect(packet.procedureTargets).toHaveLength(8);
        expect(packet.procedureTargets?.every(({ verified }) => !verified)).toBe(true);
        const [date, deadline, filing, attachment, conflict, repeated, , origin] = packet.procedureTargets!;
        const check = (
          requirementId: string,
          assessment = 'SUPPORTED',
          file = { sourceId: 'd', quote: document.text },
        ) => ({
          requirementId,
          assessment,
          norms: [{ sourceId: 'n', quote: norm.text }],
          documents: [file],
        });
        input = {
          ...empty,
          procedureChecks: [
            {
              ...check(date.id),
              documents: [
                { sourceId: 'd', quote: document.text },
                { sourceId: 'c2', quote: certificate.text },
              ],
            },
            check(deadline.id, 'PARTIAL'),
            check(filing.id, 'SUPPORTED', { sourceId: 'u', quote: narrative.text }),
            check(attachment.id, 'SUPPORTED', { sourceId: 'd', quote: 'Foi juntado.' }),
            check(conflict.id),
            check(conflict.id, 'NONE'),
            check(repeated.id),
            { ...check(origin.id), norms: [{ sourceId: unidentifiedNorm.id, quote: unidentifiedNorm.text }] },
          ],
        };
      }
      return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input } }]);
    },
  });
  let checkpoint: unknown;
  for (let stepIndex = 0; stepIndex < 12; stepIndex++) {
    const step = await task.step(binding, checkpoint, new AbortController().signal);
    checkpoint = JSON.parse(JSON.stringify(step.state));
    if (step.kind === 'completed') break;
  }
  expect(delivery?.requirements.map(({ verified }) => verified)).toEqual([true, ...Array(7).fill(false)]);
  expect(delivery?.requirements[0].sourceIds).toEqual(['d', 'n', 'c2']);
  expect(delivery?.procedureAudit).toEqual([
    {
      requirementId: delivery?.requirements[0].id,
      norms: [{ sourceId: 'n', quote: norm.text, contentHash: norm.contentHash }],
      documents: [
        { sourceId: 'd', quote: document.text, contentHash: document.contentHash },
        { sourceId: 'c2', quote: certificate.text, contentHash: certificate.contentHash },
      ],
    },
  ]);
  expect(delivery?.findings.filter(({ code }) => code === 'PROCEDURAL_REQUIREMENT_UNVERIFIED')).toHaveLength(7);
});
