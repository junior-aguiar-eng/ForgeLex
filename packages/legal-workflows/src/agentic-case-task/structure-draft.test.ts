import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { structureDraftProfile, structureTaskProfile } from '@forgelex/legal-agents';
import { structureContextSource, type EvidenceReviewItem } from '@forgelex/domain';
import { AgenticCaseTask, caseTaskContractHash } from './case-task.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const item = (seed: string, text: string, extra: Partial<EvidenceReviewItem> = {}) =>
  ({
    id: sha(seed),
    kind: 'FACT',
    text,
    classification: 'ALLEGATION',
    sources: [],
    references: [],
    originIds: [],
    blockedReasons: [],
    ...extra,
  }) as EvidenceReviewItem;
const confirmado = item('confirmado', 'O locador recebeu o aluguel de março.');
const aConfirmar = item('a-confirmar', 'O locatário pagou abril em dinheiro.');
const items = [confirmado, aConfirmar];
const structure = structureContextSource(
  'delivery:analise',
  items,
  new Map([[confirmado.id, 'ADOPT']]),
  'Resumo sintético do caso.',
)!;
const pedido = 'Redija a petição inicial de cobrança.';
const userSource = { id: `user:${sha(pedido)}`, kind: 'USER_TEXT' as const, text: pedido, contentHash: sha(pedido) };
const binding = {
  tenantId: 'tenant',
  userId: 'user',
  executionId: 'draft',
  conversationId: 'conversation',
  contextRevision: 1,
  objective: pedido,
  matterId: 'matter',
};
const plan = {
  action: 'create_document',
  documentPurpose: 'LEGAL_DOCUMENT',
  documentType: 'Petição inicial',
  requiresCaseLaw: false,
  requiresNorms: false,
  requiresProcedure: false,
  issues: [{ id: 'issue', statement: 'Cobrança de aluguéis', sourceIds: [userSource.id] }],
  gaps: [],
};
const empty = () => ({ coveredIssueIds: ['issue'], claims: [], requirements: [], findings: [], supportChecks: [] });
const drafter = (extra: Record<string, unknown> = {}) => ({
  ...empty(),
  document: {
    title: 'Petição',
    documentType: 'Petição inicial',
    sections: [
      { title: 'Dos fatos', content: 'O autor recebeu março e pagou abril em dinheiro.', sourceIds: [userSource.id] },
    ],
  },
  ...extra,
});
function fixture({
  sources = [userSource, structure] as any[],
  actionId = 'create_document' as string | null,
  guidedWorkflow = true,
  workflowVersion = 10 as 10 | 11 | 12,
  orchestrator = plan as any,
  drafted = drafter() as any,
} = {}) {
  const roles: string[] = [],
    packets: Record<string, any> = {},
    deliveries: any[] = [];
  const task = new AgenticCaseTask({
    workflowVersion,
    guidedWorkflow,
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
            input: role === 'legal-orchestrator' ? orchestrator : role === 'legal-drafter' ? drafted : empty(),
          },
        },
      ]);
    },
  });
  const b = { ...binding, actionId: (actionId ?? undefined) as any };
  const step = (state?: any) => task.step(b, state, new AbortController().signal);
  const finish = async (state?: any) => {
    for (let i = 0; i < 14; i++) {
      const r = await step(state);
      state = r.state;
      if (r.kind !== 'checkpoint') return r;
    }
    throw new Error('LOOP');
  };
  return { step, finish, roles, packets, deliveries };
}

it('create_document com a estrutura do caso roda no v14 e devolve só os itens a confirmar em structureUse', async () => {
  const f = fixture({ drafted: drafter({ structureUse: [{ itemId: aConfirmar.id, label: 'F2' }] }) });
  const r = await f.finish();
  expect(r.kind).toBe('completed');
  expect(r.state.version).toBe(14);
  expect(r.state.contractHash).toBe(caseTaskContractHash(14));
  expect(f.packets['legal-drafter'].sources.map((s: any) => s.id)).toContain(structure.id);
  expect(f.deliveries[0].structureUse).toEqual([{ itemId: aConfirmar.id, label: 'F2' }]);
  expect(f.deliveries[0].humanReviewRequired).toBe(true);
});

it('sem structureUse a entrega não traz o campo', async () => {
  const f = fixture();
  await f.finish();
  expect(f.deliveries[0]).not.toHaveProperty('structureUse');
});

it('structureUse com id fora da fonte, ou de item confirmado, derruba o trabalho', async () => {
  for (const itemId of [sha('inventado'), confirmado.id]) {
    const f = fixture({ drafted: drafter({ structureUse: [{ itemId }] }) });
    await expect(f.finish()).rejects.toThrow('STRUCTURE_ITEM_INVALID');
    expect(f.deliveries).toHaveLength(0);
  }
});

it('analyze_evidence escolhido roda no v15 e adjust_structure no v13; nenhum dos dois cai no v14', async () => {
  const analysis = await fixture({
    actionId: 'analyze_evidence',
    orchestrator: { ...plan, action: 'analyze_evidence' },
  })
    .step()
    .catch((e) => e);
  expect(analysis.state?.version).toBe(15);
  const adjust = await fixture({ actionId: 'adjust_structure', orchestrator: { ...plan, action: 'adjust_structure' } })
    .step()
    .catch((e) => e);
  expect(adjust.state?.version ?? 13).not.toBe(14);
});

it('sem guidedWorkflow a fonte é ignorada e a versão é a de hoje', async () => {
  const r = await fixture({ guidedWorkflow: false }).step();
  expect(r.state.version).toBe(10);
});

it('sem a fonte da estrutura a versão é a de hoje', async () => {
  const r = await fixture({ sources: [userSource] }).step();
  expect(r.state.version).toBe(10);
});

it('Automático: se o orquestrador escolhe analisar fatos no v14, a análise não lê a estrutura nem exige structureUse', async () => {
  const f = fixture({
    actionId: null,
    orchestrator: { ...plan, action: 'analyze_evidence', documentType: undefined, documentPurpose: undefined },
  });
  const r = await f.step().then((planned) => planned);
  expect(r.state.version).toBe(14);
  await f.finish(r.state).catch(() => undefined);
  expect(f.packets['matter-analyst']).toBeDefined();
  for (const role of ['matter-analyst', 'adversarial-reviewer'])
    if (f.packets[role]) expect(f.packets[role].sources.map((s: any) => s.id)).not.toContain(structure.id);
});

it('estado salvo em v10 retoma na própria versão, ainda que a fonte apareça depois', async () => {
  const antes = fixture({ sources: [userSource] });
  const planned = await antes.step();
  expect(planned.state.version).toBe(10);
  const depois = fixture();
  const r = await depois.step(JSON.parse(JSON.stringify(planned.state)));
  expect(r.state.version).toBe(10);
});

it('o perfil v14 manda redigir na voz da peça e proíbe a frase em terceira pessoa; os perfis antigos não mudam', () => {
  const profile = structureDraftProfile('legal-drafter');
  expect(profile.version).toBe('1.15.0');
  expect(profile.instructions).toContain('na voz e na pessoa que a peça pede');
  expect(profile.instructions).toContain('structureUse');
  expect(structureTaskProfile('legal-drafter').instructions).not.toContain('structure-context');
  expect(caseTaskContractHash(14)).not.toBe(caseTaskContractHash(12));
});
