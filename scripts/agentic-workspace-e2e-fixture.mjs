import { createHash } from 'node:crypto';
import { FakeAgentProvider } from '../packages/agent-core/dist/index.js';
import { createSkillCatalog } from '../packages/legal-agents/dist/index.js';
import { deskPilotResponse, deskPilotSkills } from './desk-pilot-e2e-fixture.mjs';
import { procedureFixtureResponse, procedureLegislationFixture } from './desk-procedure-e2e-fixture.mjs';

const skillId = 'skill-r13-forma-privada';
const skillContent = 'Título reservado R13\nCorpo reservado R13 para a contestação sintética.';

// Only imported by local test servers; never registered by production bootstrap.
export function agenticE2EPlan({ role, packet, registry }) {
  const procedure = procedureFixtureResponse({ role, packet });
  if (procedure) return procedure;
  const pilot = deskPilotResponse({ role, packet, registry });
  if (pilot) return pilot;
  const guidedFixture = packet.objective.includes('FLUXO_MESA R13');
  if (guidedFixture && role === 'legal-drafter') {
    const skill = packet.skillReferences?.find(({ id }) => id === skillId);
    if (skill?.content !== skillContent) throw new Error('A habilidade sintética não chegou ao redator.');
  }
  const action =
    packet.plan?.action ??
    (/PROBATORIA/.test(packet.objective)
      ? 'analyze_evidence'
      : /redigir|Redigir|minuta|Corrigir|Outra peça/.test(packet.objective)
        ? 'create_document'
        : /Pesquisar|SEM_ORCAMENTO/.test(packet.objective)
          ? 'research_question'
          : /Revisar/.test(packet.objective)
            ? 'review_text'
            : 'analyze_documents');
  const approved = action === 'analyze_evidence' ? [] : packet.sources.filter((s) => s.approvedItem);
  const approvedText = approved
    .filter((s) => s.kind === 'CASE_FACT')
    .map((s) => s.approvedItem.text)
    .join('\n');
  const src =
      packet.sources.find((s) => s.kind === 'DRAFT')?.id ??
      packet.sources.find((s) => s.kind === 'DOCUMENT')?.id ??
      packet.sources[0]?.id,
    refs = approved.length ? approved.map((s) => s.id) : src ? [src] : [];
  const multiple = packet.objective.includes('PERGUNTA_MULTIPLA');
  const needsQuestion = /PERGUNTA_/.test(packet.objective) && !packet.answers.length;
  const plan = {
    action,
    documentMode: /Corrigir/.test(packet.objective) ? 'EDIT' : 'CREATE',
    requiresCaseLaw: packet.objective.includes('SEM_ORCAMENTO'),
    requiresNorms: false,
    requiresProcedure: action === 'create_document',
    documentType:
      action === 'create_document' ? (guidedFixture ? 'contestacao-civel' : 'Requerimento preliminar') : undefined,
    issues: [{ id: 'goal', statement: 'Necessidade informada na fixture sintética', sourceIds: refs }],
    gaps: needsQuestion
      ? [
          {
            key: 'purpose',
            kind: 'MISSING',
            material: true,
            prompt: 'Qual a finalidade concreta?',
            reason: 'Delimitar o pedido sem presumir a medida adequada.',
            sourceIds: refs,
            selection: multiple ? 'multiple' : 'single',
            options: [
              { id: 'organize', label: 'Organizar informações' },
              { id: 'gaps', label: 'Identificar lacunas' },
            ],
          },
        ]
      : [],
  };
  const result = {
    coveredIssueIds: ['goal'],
    claims: [
      {
        id: 'allegation',
        classification: 'ALLEGATION',
        statement: approvedText || 'A parte relata que o serviço não foi entregue; alegação a conferir.',
        sourceIds: refs,
      },
    ],
    requirements: [],
    findings:
      role === 'adversarial-reviewer'
        ? [
            {
              id: 'review',
              code: 'PRELIMINARY',
              severity: 'WARNING',
              statement: 'Conferir documentos, cabimento e requisitos antes de utilizar.',
              sourceIds: refs,
            },
          ]
        : [],
    supportChecks: [],
    ...(action === 'analyze_evidence' && role === 'matter-analyst'
      ? {
          evidenceAnalysis: {
            rows: [
              {
                id: 'row',
                claimId: 'allegation',
                issueIds: ['goal'],
                references: [
                  {
                    sourceId: src,
                    quote: packet.sources.find((s) => s.id === src).text,
                    start: 0,
                    relation: 'CONTEXT',
                  },
                ],
                gaps: ['Falta documento para conferir o relato.'],
              },
            ],
            chronology: [],
            contradictions: [],
          },
        }
      : {}),
    ...(role === 'legal-drafter' && !packet.objective.includes('SEM_SUPORTE')
      ? {
          document: {
            title: 'Requerimento preliminar sintético',
            documentType: 'Requerimento preliminar',
            sections: [
              { title: 'Endereçamento', content: '[DESTINATÁRIO A CONFERIR]', sourceIds: [] },
              {
                title: 'Fatos',
                content:
                  approvedText || 'A parte relata que o serviço não foi entregue. [IDENTIFICAÇÃO E DATAS A CONFERIR]',
                sourceIds: refs,
              },
              {
                title: 'Fundamentos',
                content: '[FUNDAMENTAÇÃO E CABIMENTO A CONFERIR NAS FONTES]',
                sourceIds: [],
              },
              {
                title: 'Pedidos',
                content:
                  'Requer-se a apreciação do pedido de cumprimento do serviço, condicionado à conferência dos documentos e da medida adequada.',
                sourceIds: refs,
              },
            ],
          },
        }
      : {}),
  };
  if (role === 'legal-drafter' && /FLUXO_MESA|Corrigir/.test(packet.objective)) {
    result.document = {
      title: 'Manifestação sintética da mesa',
      documentType: 'Relato sintético',
      sections: [
        {
          title: 'Texto da peça',
          content: /Corrigir/.test(packet.objective)
            ? 'Três parcelas de R$ 100,00 cada. O total indicado no relato é R$ 300,00.'
            : 'Três parcelas de R$ 100,00 cada. O total indicado no relato é R$ 200,00.',
          sourceIds: refs,
        },
      ],
    };
  }
  if (role === 'legal-drafter' && packet.plan?.documentMode === 'EDIT' && packet.editScope) {
    const { target, ...range } = packet.editScope;
    delete result.document;
    result.editProposal = { target, changes: [{ ...range, id: 'trecho', after: 'revisto' }] };
  }
  return [
    ...(role === 'legal-researcher' && plan.requiresCaseLaw
      ? [
          {
            thought: 'fixture',
            toolCall: { name: 'research.search_case_law', input: { query: 'serviço', court: 'STJ', limit: 1 } },
          },
        ]
      : []),
    {
      thought: 'fixture',
      toolCall: { name: 'task.submit', input: role === 'legal-orchestrator' ? plan : result },
    },
  ];
}
export function agenticE2EOptions() {
  const skills =
    process.env.FORGELEX_E2E_GUIDED_SKILLS === 'true'
      ? {
          catalog: createSkillCatalog({
            version: 'catalogo-r13-sintetico',
            entries: [
              {
                id: skillId,
                version: 1,
                status: 'eligible',
                kind: 'FORM',
                areas: ['civel'],
                documentType: 'contestacao-civel',
                roles: ['legal-drafter'],
                contentHash: createHash('sha256').update(skillContent).digest('hex'),
                byteLength: Buffer.byteLength(skillContent),
              },
            ],
          }),
          budget: { maxBytesPerRole: 1000, maxBytesTotal: 1000 },
          loadContent: async () => skillContent,
        }
      : undefined;
  // Peças sintéticas da orientação mesa-v3 (U3): a lista fica no servidor e nunca chega ao navegador.
  const guidance =
    process.env.FORGELEX_E2E_GUIDANCE_V3 === 'true'
      ? {
          pieces: [
            {
              id: 'resposta-acusacao',
              label: 'Resposta à acusação',
              areas: ['penal', 'processo-penal'],
              transversal: false,
              triggers: ['defesa preliminar'],
            },
            {
              id: 'contestacao-civel',
              label: 'Contestação cível',
              areas: ['civil', 'processo-civil'],
              transversal: false,
              triggers: ['defesa do reu'],
            },
            { id: 'oficio', label: 'Ofício', areas: [], transversal: true, triggers: [] },
          ],
          matters: [
            { id: 'prescricao-intercorrente', label: 'Prescrição intercorrente', area: 'civil' },
            { id: 'prova-ilicita', label: 'Prova ilícita', area: 'processo-penal' },
          ],
        }
      : undefined;
  return {
    pollMs: 100,
    ...(guidance ? { guidance } : {}),
    caseTask: {
      skills: deskPilotSkills() ?? skills,
      ...(process.env.FORGELEX_E2E_PROCEDURE === 'true' ? { legislationProvider: procedureLegislationFixture } : {}),
      authorizeNative: async () => {},
      createProvider: (input) => new FakeAgentProvider(input.registry, undefined, agenticE2EPlan(input)),
    },
  };
}
