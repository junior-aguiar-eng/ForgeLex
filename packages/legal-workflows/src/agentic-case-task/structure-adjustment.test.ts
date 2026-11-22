import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import {
  ApprovedCaseTaskPlanSchema,
  DeliveryTaskPlanSchema,
  EvidenceTaskPlanSchema,
  GuidedDeskPlanSchema,
  StructureTaskPlanSchema,
  TaskPlanSchema,
} from '@forgelex/legal-agents';
import { structureItemsSource, type EvidenceReviewItem } from '@forgelex/domain';
import { AgenticCaseTask, caseTaskContractHash } from './case-task.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const item = (seed: string, kind: EvidenceReviewItem['kind'], text: string, extra: Partial<EvidenceReviewItem> = {}) =>
  ({
    id: sha(seed),
    kind,
    text,
    classification: 'ALLEGATION',
    sources: [],
    references: [],
    originIds: [],
    blockedReasons: [],
    ...extra,
  }) as EvidenceReviewItem;
const fato = item('fato', 'FACT', 'O cliente pagou o aluguel de março.');
const evento = item('evento', 'TIMELINE', 'Entrega das chaves', { dateText: '2020-05-01', eventDate: '2020-05-01' });
const prova = item('prova', 'EVIDENCE', 'Recibo de março.', { classification: 'EXTRACTED' });
const items = [fato, evento, prova];
const pedido = 'A entrega das chaves foi em 2021-05-01. Tire o recibo. O cliente também pagou abril em dinheiro.';
const userSource = { id: `user:${sha(pedido)}`, kind: 'USER_TEXT' as const, text: pedido, contentHash: sha(pedido) };
const structure = structureItemsSource('delivery:analise', items, new Set());
const binding = {
  tenantId: 'tenant',
  userId: 'user',
  executionId: 'adjust',
  conversationId: 'conversation',
  contextRevision: 1,
  objective: pedido,
  actionId: 'adjust_structure' as const,
  matterId: 'matter',
};
const plan = {
  action: 'adjust_structure',
  requiresCaseLaw: false,
  requiresNorms: false,
  requiresProcedure: false,
  issues: [{ id: 'issue', statement: 'Ajustar a estrutura conforme o pedido', sourceIds: [userSource.id] }],
  gaps: [],
};
const adjustment = () => ({
  commands: [
    { op: 'ALTERAR', itemId: evento.id, dataEvento: '2021-05-01' },
    { op: 'REMOVER', itemId: prova.id },
    { op: 'ACRESCENTAR', texto: 'O cliente pagou o aluguel de abril em dinheiro.', frase: 'pagou abril em dinheiro' },
  ],
  caseSummary:
    'O cliente alega ter pago março e abril; a entrega das chaves teria ocorrido em 2021. Nada está provado.',
});
const empty = () => ({ coveredIssueIds: ['issue'], claims: [], requirements: [], findings: [], supportChecks: [] });
function fixture({
  analyst = { ...empty(), structureAdjustment: adjustment() } as any,
  reviewer = empty() as any,
  orchestrator = plan as any,
  workflowVersion = 10 as 10 | 12,
  sources = [userSource, structure] as any[],
  actionId = 'adjust_structure' as string | null,
} = {}) {
  const roles: string[] = [],
    packets: Record<string, any> = {},
    deliveries: any[] = [];
  const task = new AgenticCaseTask({
    workflowVersion,
    context: {
      load: async () => ({ contextId: 'conversation', contextRevision: 1, sources, answers: [] }),
      assert: async () => {},
      save: async (_b, d) => {
        deliveries.push(d);
        return { id: 'delivery' };
      },
    },
    tools: [],
    createProvider: ({ role, registry, packet }) => {
      roles.push(role);
      packets[role] = packet;
      return new FakeAgentProvider(registry, undefined, [
        {
          toolCall: {
            name: 'task.submit',
            input: role === 'legal-orchestrator' ? orchestrator : role === 'matter-analyst' ? analyst : reviewer,
          },
        },
      ]);
    },
  });
  const b = { ...binding, actionId: (actionId ?? undefined) as any };
  const step = (state?: any) => task.step(b, state, new AbortController().signal);
  const finish = async (state?: any) => {
    for (let i = 0; i < 12; i++) {
      const r = await step(state);
      state = r.state;
      if (r.kind !== 'checkpoint') return r;
    }
    throw new Error('LOOP');
  };
  return { step, finish, roles, packets, deliveries };
}

it('accepts adjust_structure only in the new plan contract; every earlier plan refuses it', () => {
  for (const schema of [
    TaskPlanSchema,
    EvidenceTaskPlanSchema,
    ApprovedCaseTaskPlanSchema,
    DeliveryTaskPlanSchema,
    GuidedDeskPlanSchema,
  ])
    expect(schema.safeParse(plan).success).toBe(false);
  expect(StructureTaskPlanSchema.safeParse(plan).success).toBe(true);
  expect(StructureTaskPlanSchema.safeParse({ ...plan, action: 'analyze_evidence' }).success).toBe(false);
  // The new contract never runs research, norms or procedure.
  expect(StructureTaskPlanSchema.safeParse({ ...plan, requiresNorms: true }).success).toBe(false);
});

it('runs adjust_structure in v13 with analyst and adversarial check, delivering commands and summary', async () => {
  const f = fixture();
  const r = await f.finish();
  expect(r.kind).toBe('completed');
  expect(r.state.version).toBe(13);
  expect(r.state.contractHash).toBe(caseTaskContractHash(13));
  expect(f.roles).toEqual(['legal-orchestrator', 'matter-analyst', 'adversarial-reviewer']);
  expect(f.packets['adversarial-reviewer'].proposedStructureAdjustment).toEqual(adjustment());
  expect(f.packets['matter-analyst'].sources.map((s: any) => s.id)).toContain(structure.id);
  expect(f.deliveries).toHaveLength(1);
  expect(f.deliveries[0]).toMatchObject({
    action: 'adjust_structure',
    structureAdjustment: adjustment(),
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
  });
});

it('refuses adjust_structure planned under an earlier contract', async () => {
  for (const workflowVersion of [10, 12] as const) {
    const f = fixture({ workflowVersion, actionId: null });
    await expect(f.step()).rejects.toThrow();
    expect(f.roles).toEqual(['legal-orchestrator']);
    expect(f.deliveries).toHaveLength(0);
  }
});

it('rejects a command whose itemId is not among the items received', async () => {
  const foreign = adjustment();
  foreign.commands[1] = { op: 'REMOVER', itemId: sha('outro') } as any;
  const f = fixture({ analyst: { ...empty(), structureAdjustment: foreign } });
  await expect(f.finish()).rejects.toThrow();
  expect(f.roles).not.toContain('adversarial-reviewer');
  expect(f.deliveries).toHaveLength(0);
});

it('the adversarial check refuses a checkpoint whose commands point outside the received items', async () => {
  const f = fixture();
  const planned = await f.step();
  const analysed = await f.step(planned.state);
  const tampered = JSON.parse(JSON.stringify(analysed.state));
  tampered.structureAdjustment.commands[0].itemId = sha('outro');
  await expect(f.step(tampered)).rejects.toThrow('STRUCTURE_ITEM_INVALID');
  expect(f.roles).not.toContain('adversarial-reviewer');
  expect(f.deliveries).toHaveLength(0);
});

it('rejects ACRESCENTAR without the user phrase and an analyst result without the adjustment', async () => {
  const noPhrase = adjustment();
  noPhrase.commands[2] = { op: 'ACRESCENTAR', texto: 'Fato sem origem.' } as any;
  for (const analyst of [{ ...empty(), structureAdjustment: noPhrase }, empty()]) {
    const f = fixture({ analyst });
    await expect(f.finish()).rejects.toThrow();
    expect(f.deliveries).toHaveLength(0);
  }
});

it('does not run without the items of the current analysis', async () => {
  const f = fixture({ sources: [userSource] });
  await expect(f.finish()).rejects.toThrow('STRUCTURE_NOT_AVAILABLE');
  expect(f.roles).toHaveLength(0);
});

it('asks through the plan instead of guessing when the reference is ambiguous', async () => {
  const f = fixture({
    orchestrator: {
      ...plan,
      gaps: [
        {
          key: 'qual-fato',
          kind: 'MISSING',
          material: true,
          deliveryImpact: 'BLOCKING',
          prompt: 'Qual fato você quer corrigir?',
          reason: 'Não há fato 3 na estrutura.',
          sourceIds: [userSource.id],
          options: [],
        },
      ],
    },
  });
  const r = await f.finish();
  expect(r.kind).toBe('question');
  expect(f.roles).toEqual(['legal-orchestrator']);
});

it('keeps every historical contract hash and the pre-* fixtures unchanged', () => {
  const pinned: Record<number, string> = {
    1: 'd097ba9f837fd4a6b89c97baf3e2baa632949482e505f21e6ba42f0b25860888',
    2: 'be6575c4850189f940e206101d9148cc33430bf023e833549c06d4d9ec7ea482',
    3: '6ee7e6a0847f63875f3e463cf978239496ec1a48b563107a9231512a6d96a50d',
    4: '4fa1703ae118de111a38aa4c33528533ff3bc81cb88c75cb1c5010451e909b2f',
    5: '08c442cbecc20d11b8f0ea9b7d7f61e88de61284d6c7b04d62e42ca5413a37ae',
    6: 'cf68b4627fb1598fddca9b0e2e7e3bc0272b0dd352388c263d042b580a58e970',
    7: '0f0504e97bf5c8278356e3afbc867d1eab6f01fd0c0d7ddda5ac4febab0007a9',
    8: 'b66451556afcf764b86b8e8e4217874b992670dfb85bf01853dec65cecb8271f',
    9: '8111c1f414417b2a5714b938b4b10988139104c647ffc4cd98e29ee2a57ae013',
    10: 'dd6fa0bbdba313a9f0a7cd9ad435e7f4678b7a8af202b9cbb7cee576e7cf060c',
    11: 'b638f35a5c194d0be4903e136db7673f2ba3b766fd5f9c3ca8bb05e0f713c523',
    12: '0dbb3f5ea7bf95be5ee1aadc60e54af6a05ad6e207de01673b5834ff5c9c59ad',
  };
  for (const [version, value] of Object.entries(pinned))
    expect(caseTaskContractHash(Number(version) as any)).toBe(value);
  expect(Object.values(pinned)).not.toContain(caseTaskContractHash(13));
  const dir = new URL('./fixtures/', import.meta.url);
  const fixtures = readdirSync(dir).filter((name) => name.startsWith('pre-'));
  expect(fixtures.length).toBeGreaterThanOrEqual(5);
  for (const name of fixtures) {
    const { state } = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    expect(state.contractHash).toBe(caseTaskContractHash(state.version));
  }
});
