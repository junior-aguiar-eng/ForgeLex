import { FakeAgentProvider } from '../packages/agent-core/dist/index.js';
// Only imported by the local E2E server. Never registered by production bootstrap.
export function agenticE2EOptions() {
  return {
    pollMs: 100,
    caseTask: {
      authorizeNative: async () => {}, // The E2E API still authenticates the local session/owner; no real external access.
      createProvider: ({ role, registry, packet }) => {
        const action =
          packet.plan?.action ??
          (/redigir|Redigir|minuta/.test(packet.objective)
            ? 'create_document'
            : /Pesquisar|SEM_ORCAMENTO/.test(packet.objective)
              ? 'research_question'
              : /Revisar/.test(packet.objective)
                ? 'review_text'
                : 'analyze_documents');
        const src = packet.sources.find((s) => s.kind === 'DOCUMENT')?.id ?? packet.sources[0]?.id,
          refs = src ? [src] : [];
        const multiple = packet.objective.includes('PERGUNTA_MULTIPLA');
        const needsQuestion = /PERGUNTA_/.test(packet.objective) && !packet.answers.length;
        const plan = {
          action,
          requiresCaseLaw: packet.objective.includes('SEM_ORCAMENTO'),
          requiresNorms: false,
          requiresProcedure: action === 'create_document',
          documentType: action === 'create_document' ? 'Requerimento preliminar' : undefined,
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
              statement: 'A parte relata que o serviço não foi entregue; alegação a conferir.',
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
          ...(role === 'legal-drafter' && !packet.objective.includes('SEM_SUPORTE')
            ? {
                document: {
                  title: 'Requerimento preliminar sintético',
                  documentType: 'Requerimento preliminar',
                  sections: [
                    { title: 'Endereçamento', content: '[DESTINATÁRIO A CONFERIR]', sourceIds: [] },
                    {
                      title: 'Fatos',
                      content: 'A parte relata que o serviço não foi entregue. [IDENTIFICAÇÃO E DATAS A CONFERIR]',
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
        return new FakeAgentProvider(registry, undefined, [
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
        ]);
      },
    },
  };
}
