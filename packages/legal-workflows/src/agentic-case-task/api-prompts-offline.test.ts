import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeAgentProvider, type AgentTool } from '@forgelex/agent-core';
import { COMMERCIAL_POLICY } from '@forgelex/billing-ledger';
import {
  createDeskEditSnapshot,
  type AgenticTaskDelivery,
  type NativeTaskPacket,
  type TaskBinding,
  type TaskSource,
} from '@forgelex/domain';
import { LEGAL_EVALUATION_CASES, type DeliveryTaskPlan, type TaskSpecialistResult } from '@forgelex/legal-agents';
import { z } from 'zod';
import { AgenticCaseTask, type CaseTaskOptions, type CaseTaskProviderInput, type CaseTaskStep } from './case-task.js';
import { initialGuidance } from '../desk-guidance/guidance-rules.js';
import { corpus } from '../../../../scripts/forgelex-final-evaluation/corpus.mjs';
import {
  stageA3Role,
  a3Reports,
  a3Arm,
} from '../../../../scripts/forgelex-final-evaluation/api-prompts-a3-budget.fixture.js';

import { phase1, runPhase1 } from '../../../../scripts/forgelex-final-evaluation/api-prompts-a3-phase1.fixture.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const source = (id: string, kind: TaskSource['kind'], text: string): TaskSource => ({
  id,
  kind,
  text,
  contentHash: hash(text),
});
const draftId = '10000000-0000-4000-8000-000000000001';
const versionId = '10000000-0000-4000-8000-000000000002';
const sectionId = '10000000-0000-4000-8000-000000000003';
const otherId = '10000000-0000-4000-8000-000000000004';
const original = '  📄 Antes: trocar. Depois.\r\n';
const other = 'Fundamentação integral preservada.';
const deskEdit = createDeskEditSnapshot(
  {
    draftId,
    versionId,
    versionHash: 'a'.repeat(64),
    title: 'Peça',
    sections: [
      { id: sectionId, title: 'Relato', content: original },
      { id: otherId, title: 'Fundamento', content: other },
    ],
  },
  { versionId, sectionId, start: original.indexOf('trocar'), end: original.indexOf('trocar') + 6, before: 'trocar' },
);
const empty: TaskSpecialistResult = {
  coveredIssueIds: ['issue'],
  claims: [],
  requirements: [],
  findings: [],
  supportChecks: [],
};
const finding = (code: string, statement: string, sourceIds: string[]) => ({
  id: code,
  code,
  severity: 'WARNING' as const,
  statement,
  sourceIds,
});
const claim = (id: string, statement: string, sourceIds: string[]) => ({
  id,
  statement,
  sourceIds,
  classification: 'INFERENCE' as const,
});
const gap = (deliveryImpact: 'LIMITATION' | 'BLOCKING', reason: string, prompt?: string) => ({
  key: 'missing',
  kind: 'MISSING' as const,
  material: true,
  deliveryImpact,
  reason,
  prompt: prompt ?? reason,
  sourceIds: ['context'],
  options: [],
});
const dossierSources = (id: string, includeDraft = false) => {
  const dossier = corpus.dossiers.find((item) => item.id === id)!;
  return [
    source('context', 'USER_TEXT', dossier.context),
    ...dossier.documents.map(([key, text]) => source(key, 'DOCUMENT', text)),
    ...(includeDraft && dossier.draft ? [source('draft', 'DRAFT', dossier.draft)] : []),
  ];
};
const authority = [
  {
    id: 'favoravel',
    syllabus:
      'Caso sintético A: para comprovar entrega de equipamento, o recibo contemporâneo assinado sustenta a alegação de entrega.',
  },
  {
    id: 'contrario',
    syllabus:
      'Caso sintético B: para comprovar entrega de equipamento, a planilha unilateral do fornecedor não basta sem confirmação de recebimento.',
  },
];
const researchContext =
  'Corpus fechado P-01, exclusivamente sintético. Consulte a ferramenta de pesquisa disponível nesta tarefa. Ela retorna os registros do corpus para o objetivo atual sem parâmetros de busca. Trabalhe com o resultado, inclusive se for vazio.';
const searchTool = (items: typeof authority): AgentTool<any, any> => ({
  name: 'research.search_case_law',
  description: 'Consulta ao corpus fechado da fixture.',
  impactLevel: 'L0_OBSERVATION',
  inputSchema: z.strictObject({}),
  outputSchema: z.any(),
  execute: async () => ({ success: true, data: { status: 'VERIFIED_PROVIDER', items } }),
});
const evidence: unknown[] = [];
const candidate = a3Arm?.prompts
  ? a3Arm.prompts === 'revised'
  : process.env.FORGELEX_API_PROMPTS_OFFLINE_VARIANT !== 'baseline';
const baselineContracts = {
  11: 'b638f35a5c194d0be4903e136db7673f2ba3b766fd5f9c3ca8bb05e0f713c523',
  12: '0dbb3f5ea7bf95be5ee1aadc60e54af6a05ad6e207de01673b5834ff5c9c59ad',
};
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('OFFLINE_EVALUATION_NETWORK_FORBIDDEN');
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  const path = process.env.FORGELEX_API_PROMPTS_OFFLINE_REPORT;
  if (path)
    writeFileSync(
      path,
      JSON.stringify(
        {
          methodology:
            'Respostas fixas e ferramentas locais. Mede contratos e fluxo, sem inferência ou aceite jurídico.',
          variant: candidate ? 'candidate' : 'baseline',
          commercialPolicy: COMMERCIAL_POLICY,
          comparisonSettings: {
            reasoning: 'low',
            serviceTier: 'default',
            parallelTools: false,
            cache: 'explicit',
            store: false,
          },
          scenarios: evidence,
        },
        null,
        2,
      ) + '\n',
    );
  a3Reports();
});

async function run(
  id: string,
  rubricId: string,
  objective: string,
  action: TaskBinding['actionId'],
  options: {
    sources?: TaskSource[];
    plan?: Partial<DeliveryTaskPlan> & {
      documentMode?: 'CREATE' | 'EDIT';
      documentPurpose?: 'LEGAL_DOCUMENT' | 'FACTUAL_RECORD';
    };
    outputs?: Record<string, Record<string, unknown>>;
    deskEdit?: NativeTaskPacket['deskEdit'];
    search?: typeof authority;
    answers?: NativeTaskPacket['answers'];
    partialSupport?: string;
  } = {},
) {
  const rubric = LEGAL_EVALUATION_CASES.find((item) => item.id === rubricId);
  expect(rubric).toBeDefined();
  const sources = options.sources ?? [source('context', 'USER_TEXT', objective)];
  const roles: string[] = [];
  const profileHashes: Record<string, string> = {};
  const instructions: Record<string, string> = {};
  let probe: Promise<unknown> | undefined;
  const packet: NativeTaskPacket = {
    contextId: id,
    contextRevision: 1,
    sources,
    answers: options.answers ?? [],
    guidance: initialGuidance(),
    ...(options.deskEdit ? { deskEdit: options.deskEdit } : {}),
  };
  const binding: TaskBinding = {
    tenantId: 'synthetic',
    userId: 'offline',
    conversationId: id,
    executionId: id,
    contextRevision: 1,
    objective,
    actionId: action,
  };
  let delivery: AgenticTaskDelivery | undefined;
  const submissionFor = (role: string, context: CaseTaskProviderInput['packet']) => {
    const supportChecks = context.supportTargets?.map(({ claimId, sourceId, quote }) => ({
      claimId,
      sourceId,
      quote: quote ?? context.sources.find((item) => item.id === sourceId)!.text,
      assessment: sourceId === options.partialSupport ? 'PARTIAL' : 'SUPPORTED',
    }));
    return role === 'legal-orchestrator'
      ? {
          action,
          requiresCaseLaw: options.search !== undefined,
          requiresNorms: false,
          requiresProcedure: false,
          issues: [{ id: 'issue', statement: objective, sourceIds: ['context'] }],
          gaps: [],
          ...options.plan,
        }
      : { ...empty, ...(supportChecks ? { supportChecks } : {}), ...options.outputs?.[role] };
  };
  const taskOptions: CaseTaskOptions = {
    guidedWorkflow: true,
    ...(candidate ? { workflowVersion: 16 as const } : {}),
    tools: options.search ? [searchTool(options.search)] : [],
    context: {
      load: async () => packet,
      assert: async () => {},
      save: async (_binding, value) => {
        delivery = value;
        return { id: 'delivery' };
      },
    },
    createProvider: (providerInput) => {
      const { role, registry, packet: context } = providerInput;
      roles.push(role);
      const provider = new FakeAgentProvider(registry, undefined, [
        ...(role === 'legal-researcher' && options.search
          ? [{ thought: '', toolCall: { name: 'research.search_case_law', input: {} } }]
          : []),
        { thought: '', toolCall: { name: 'task.submit', input: submissionFor(role, context) } },
      ]);
      return {
        id: 'fake',
        cancel: (...args) => provider.cancel(...args),
        run(input) {
          profileHashes[role] = hash(input.systemPolicy);
          instructions[role] = JSON.parse(input.systemPolicy).profile.instructions;
          if (role === 'legal-orchestrator') {
            const policy = JSON.parse(input.systemPolicy);
            expect(policy.boundAction).toMatchObject({ actionId: action });
            if (id === 'A04') {
              expect(policy.researchHandoff).toMatchObject({
                role: 'legal-researcher',
                tool: 'research.search_case_law',
                planField: 'requiresCaseLaw',
              });
              expect(input.tools.some((tool) => tool.name === 'research.search_case_law')).toBe(false);
            }
          }
          if (a3Arm && /^A0[1-8]$/.test(id)) probe = stageA3Role(id, providerInput, input);
          return provider.run(input);
        },
      };
    },
  };
  if (phase1) {
    await runPhase1(
      id,
      hash(JSON.stringify({ binding, packet, options })),
      async (runtime, signal) => {
        const task = new AgenticCaseTask({
          ...taskOptions,
          createProvider: runtime.createProvider,
          authorizeRealProvider: runtime.authorizeRealProvider,
        });
        let step = await task.step(binding, undefined, signal);
        for (let index = 0; step.kind === 'checkpoint' && index < 24; index++)
          step = await task.step(binding, step.state, signal);
        if (step.kind === 'checkpoint') throw new Error('A3_WORKFLOW_STEP_LIMIT');
        return {
          outcome: step.kind,
          delivery,
          question: step.question,
          workflowVersion: step.state.version,
          contractHash: step.state.contractHash,
          rubric,
        };
      },
      submissionFor,
      options.search !== undefined,
    );
    return {} as {
      step: CaseTaskStep;
      delivery: AgenticTaskDelivery | undefined;
      roles: string[];
      instructions: Record<string, string>;
    };
  }
  const signal = new AbortController().signal;
  let task = new AgenticCaseTask(taskOptions);
  let step: CaseTaskStep = await task.step(binding, undefined, signal);
  await probe;
  if (id === 'A07') {
    expect(step.kind).toBe('checkpoint');
    // A checkpoint selects its original profile even when the option for new executions changes.
    task = new AgenticCaseTask({ ...taskOptions, workflowVersion: candidate ? undefined : 16 });
  }
  for (let index = 0; step.kind === 'checkpoint' && index < 20; index++) {
    step = await task.step(binding, step.state, signal);
    await probe;
  }
  expect(step.kind).not.toBe('checkpoint');
  if (candidate) expect(step.state.version).toBe(16);
  else {
    const version = options.deskEdit || sources.some((item) => item.kind === 'DRAFT') ? 12 : 11;
    expect(step.state.contractHash).toBe(baselineContracts[version]);
  }
  evidence.push({
    id,
    rubric,
    inputHash: hash(JSON.stringify({ binding, packet, options })),
    outcome: step.kind,
    status: delivery?.status,
    roles,
    workflowVersion: step.state.version,
    contractHash: step.state.contractHash,
    profileHashes,
  });
  return { step, delivery, roles, instructions };
}

it('A01 revisa quitação sem comprovante como limitação', async () => {
  const reason = 'A fatura não demonstra pagamento nem inadimplemento.';
  const { step, delivery } = await run('A01', 'support-negative', 'Revisar afirmação de quitação', 'review_text', {
    sources: dossierSources('D03', true),
    plan: { gaps: [gap('LIMITATION', reason)] },
    outputs: { 'adversarial-reviewer': { findings: [finding('TEXT_CORRECTION', reason, ['fatura'])] } },
  });
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(delivery?.status).toBe('LIMITED');
  expect(delivery?.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'TEXT_CORRECTION', statement: reason, sourceIds: ['fatura'] }),
      expect.objectContaining({ code: 'DELIVERY_INFORMATION_LIMITED' }),
    ]),
  );
});

it('A02 entrega minuta condicionada quando a urgência não está demonstrada', async () => {
  const reason = 'Perigo concreto e reversibilidade pendem de demonstração.';
  const sections = [{ title: 'Requisitos pendentes', content: reason, sourceIds: ['pedido'] }];
  const { step, delivery } = await run(
    'A02',
    'procedure-ambiguous',
    'Prepare uma minuta preliminar condicionada para Aurora sobre o fornecimento dos equipamentos. Deixe em aberto a modalidade da peça e a fase processual. Identifique os fatos e requisitos pendentes sem afirmar que a urgência foi demonstrada.',
    'create_document',
    {
      sources: dossierSources('D04'),
      plan: { documentType: 'Petição', documentMode: 'CREATE', gaps: [gap('LIMITATION', reason)] },
      outputs: { 'legal-drafter': { document: { title: 'Minuta preliminar', documentType: 'Petição', sections } } },
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(delivery).toMatchObject({ status: 'LIMITED', document: { sections } });
});

it('A03 identifica os dados ausentes e deixa o prazo sem cálculo', async () => {
  const prompt = 'Qual foi a data da intimação e qual calendário se aplica?';
  const { step, delivery, roles } = await run(
    'A03',
    'procedure-negative',
    'Analisar se o termo final de um prazo processual pode ser determinado. A data da intimação e o calendário aplicável estão ausentes. Identifique os dados indispensáveis antes de calcular qualquer data.',
    'analyze_documents',
    {
      plan: { gaps: [gap('BLOCKING', 'Faltam marco inicial e calendário.', prompt)] },
    },
  );
  if (phase1) return;
  expect(step).toMatchObject({ kind: 'question', question: { prompt } });
  expect(delivery).toBeUndefined();
  expect(roles).toEqual(['legal-orchestrator']);
});

it('A04 mantém precedentes favorável e contrário rastreáveis', async () => {
  const claims = authority.map(({ id, syllabus }) => claim(id, syllabus, [id]));
  const { step, delivery, instructions } = await run(
    'A04',
    'counter-positive',
    'Pesquise no corpus sintético P-01 as posições favorável e contrária sobre a suficiência de prova documental da entrega de equipamento. Compare o recibo assinado à planilha unilateral, identifique as diferenças e vincule cada posição ao registro recuperado.',
    'research_question',
    {
      search: authority,
      sources: [source('context', 'USER_TEXT', researchContext)],
      outputs: { 'legal-researcher': { claims } },
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(step.state.researchOperations).toContain('research.search_case_law');
  expect(delivery?.claims).toEqual(
    expect.arrayContaining(claims.map(({ statement, sourceIds }) => expect.objectContaining({ statement, sourceIds }))),
  );
  expect(delivery?.supportAudit).toEqual(
    expect.arrayContaining(
      authority.map(({ id }) =>
        expect.objectContaining({ sourceId: id, modelAssessment: 'SUPPORTED', quoteStatus: 'MATCHED' }),
      ),
    ),
  );
  if (candidate) {
    expect(instructions['legal-researcher']).toContain('corpus autorizado');
    expect(instructions['authority-verifier']).toContain('entrega e pagamento');
  }
});

it('preserva suporte parcial mesmo com identidade confirmada e trecho literal', async () => {
  const [{ id, syllabus }] = authority;
  const { delivery } = await run(
    'partial',
    'support-ambiguous',
    'Conferir o suporte à proposição composta',
    'research_question',
    {
      search: [authority[0]],
      partialSupport: id,
      outputs: { 'legal-researcher': { claims: [claim(id, syllabus + ' Também sustenta o pagamento.', [id])] } },
    },
  );
  expect(delivery?.supportAudit).toContainEqual(
    expect.objectContaining({
      sourceId: id,
      modelAssessment: 'PARTIAL',
      quoteStatus: 'MATCHED',
    }),
  );
  expect(delivery?.status).toBe('LIMITED');
});

it('aproveita a resposta existente a uma lacuna impeditiva', async () => {
  const { step, roles } = await run(
    'answered',
    'procedure-negative',
    'Identificar o marco informado',
    'analyze_documents',
    {
      plan: { gaps: [gap('BLOCKING', 'Identificar marco inicial.')] },
      answers: [
        {
          questionId: 'case-task:missing',
          questionVersion: 1,
          contextRevision: 1,
          selectedOptionIds: [],
          freeText: 'A intimação ocorreu em 04/11.',
        },
      ],
    },
  );
  expect(step.kind).toBe('completed');
  expect(roles).toContain('matter-analyst');
});

it('A05 mantém autoridade fictícia sem validação após consulta sem resultado', async () => {
  const { step, delivery } = await run(
    'A05',
    'support-negative',
    'Consulte o índice do corpus sintético P-01 pelo identificador exato X00, atribuído no enunciado ao Tribunal Sintético, Câmara de Entregas. Se a busca fechada não retornar registro, informe a falta de validação nesse corpus.',
    'research_question',
    {
      search: [],
      sources: [source('context', 'USER_TEXT', researchContext)],
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(step.state.researchOperations).toContain('research.search_case_law');
  expect(delivery?.claims).toEqual([]);
  expect(delivery?.findings).toContainEqual(expect.objectContaining({ code: 'SEARCH_NO_RESULTS' }));
  expect(delivery?.sources).toHaveLength(1);
});

it('A06 preserva documentos contraditórios e suas origens', async () => {
  const sources = [
    source('context', 'USER_TEXT', 'Os dois relatos se referem à data de entrega do mesmo equipamento X em 2026.'),
    source('d1', 'DOCUMENT', 'O relato A indica entrega do equipamento X em 01/10/2026.'),
    source('d2', 'DOCUMENT', 'O relato B indica entrega do equipamento X em 02/10/2026.'),
  ];
  const conflict = {
    ...claim('conflict', 'A indica 01/10/2026 e B indica 02/10/2026 para a entrega do equipamento X.', ['d1', 'd2']),
    classification: 'CONFLICT',
  };
  const { step, delivery } = await run(
    'A06',
    'support-ambiguous',
    'Analise e confronte os dois registros sobre a data de entrega do equipamento X, indicando as duas versões e suas fontes.',
    'analyze_documents',
    {
      sources,
      outputs: { 'matter-analyst': { claims: [conflict] } },
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(delivery?.claims).toEqual([expect.objectContaining({ classification: 'CONFLICT', sourceIds: ['d1', 'd2'] })]);
});

it('A07 altera apenas a seleção, incluindo offsets UTF-16 e CRLF', async () => {
  const { step, delivery, instructions } = await run(
    'A07',
    'requests-positive',
    'Substituir trocar por manter na seleção',
    'create_document',
    {
      sources: [
        source('context', 'USER_TEXT', 'Trocar a palavra selecionada.'),
        { ...source(versionId, 'DRAFT', original + other), documentId: draftId, versionId },
      ],
      deskEdit,
      plan: { documentType: 'Peça', documentMode: 'EDIT' },
      outputs: {
        'legal-drafter': {
          editProposal: {
            target: deskEdit.target,
            changes: [{ ...deskEdit.scope, id: 'edit', after: 'manter' }],
          },
        },
      },
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(delivery).toMatchObject({
    replacesVersionId: versionId,
    document: {
      sections: [
        { title: 'Relato', content: original.replace('trocar', 'manter') },
        { title: 'Fundamento', content: other },
      ],
    },
  });
  expect(instructions['legal-drafter']).toContain('editProposal');
  if (candidate) expect(instructions['legal-drafter']).not.toContain('devolva o documento inteiro atualizado');
  else expect(instructions['legal-drafter']).toContain('devolva o documento inteiro atualizado');
});

it('A08 confere gramática e aritmética sem alterar a peça ou os valores de origem', async () => {
  const content = 'As parcelas foi de R$ 10 e R$ 20. Total declarado: R$ 40.';
  const correction = 'Corrigir a concordância e apontar que R$ 10 + R$ 20 = R$ 30, mantendo ambas as parcelas.';
  const { step, delivery, roles } = await run(
    'A08',
    'requests-positive',
    'Revisar gramática e conferir a soma',
    'review_text',
    {
      sources: [source('context', 'USER_TEXT', 'Registrar sugestões sem editar.'), source('draft', 'DRAFT', content)],
      outputs: { 'adversarial-reviewer': { findings: [finding('TEXT_CORRECTION', correction, ['draft'])] } },
    },
  );
  if (phase1) return;
  expect(step.kind).toBe('completed');
  expect(roles).not.toContain('legal-drafter');
  expect(delivery?.document).toBeUndefined();
  expect(delivery?.findings).toContainEqual(expect.objectContaining({ statement: correction, sourceIds: ['draft'] }));
});

it('pede seleção antes de executar o redator e não grava alterações', async () => {
  const { delivery, roles } = await run(
    'no-selection',
    'requests-positive',
    'Altere a peça aberta',
    'create_document',
    {
      sources: [
        source('context', 'USER_TEXT', 'Altere a peça aberta.'),
        { ...source(versionId, 'DRAFT', original), documentId: draftId, versionId },
      ],
      plan: { documentMode: 'EDIT' },
    },
  );
  expect(roles).toEqual(['legal-orchestrator']);
  expect(delivery?.findings).toContainEqual(expect.objectContaining({ code: 'DESK_EDIT_SCOPE_REQUIRED' }));
  expect(delivery?.document).toBeUndefined();
});
