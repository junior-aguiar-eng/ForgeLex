/** Perguntas previstas nos contratos; não cria diálogo na aplicação. */
export const LEGAL_ACTION_REQUIREMENTS = {
  analyze_documents: {
    objective: 'Delimitar contexto, questões e lacunas do material fornecido.',
    contextRequirements: ['objetivo', 'texto ou referências versionadas'],
    playbookId: 'analyze_documents-playbook',
    dialogue: [
      {
        id: 'analysis-goal',
        prompt: 'Qual resultado você procura com esta análise?',
        options: ['Entender o caso', 'Identificar questões', 'Organizar fatos e provas', 'Ainda não sei'],
        allowFreeText: true,
      },
    ],
    deliveryCriteria: ['origem das alegações e inferências', 'questões e lacunas explícitas'],
    steps: [
      'delimitar objetivo e material',
      'mapear partes e cronologia disponíveis',
      'separar alegações, inferências e conflitos',
      'formular questões e lacunas com origem',
      'validar handoff',
    ],
  },
  research_question: {
    objective: 'Investigar uma questão jurisprudencial no recorte STJ.',
    contextRequirements: ['questão ou tema', 'recorte jurisprudencial STJ'],
    playbookId: 'research_question-playbook',
    dialogue: [
      {
        id: 'research-goal',
        prompt: 'O que você precisa investigar?',
        options: ['Entendimento sobre um tema', 'Autoridade identificada', 'Posições divergentes', 'Ainda não sei'],
        allowFreeText: true,
      },
    ],
    deliveryCriteria: ['status e proveniência das autoridades', 'limites do corpus e da verificação'],
    steps: [
      'delimitar questão',
      'localizar candidatos',
      'obter e verificar autoridades',
      'declarar divergências e limitações',
      'validar handoff',
    ],
  },
  create_document: {
    objective: 'Preparar minuta orientada pela finalidade, questões e fontes.',
    contextRequirements: [
      'finalidade ou necessidade de esclarecimento',
      'contexto fornecido',
      'fontes disponíveis e lacunas',
    ],
    playbookId: 'create_document-playbook',
    dialogue: [
      {
        id: 'draft-goal',
        prompt: 'Qual a finalidade do texto?',
        options: ['Apresentar pedido', 'Responder a uma manifestação', 'Organizar argumentos', 'Ainda não sei'],
        allowFreeText: true,
      },
    ],
    deliveryCriteria: [
      'estrutura e argumentos vinculados ao material',
      'pedidos e requisitos sem suporte identificados',
      'candidato sujeito à revisão',
    ],
    steps: [
      'delimitar finalidade e posição processual',
      'mapear questões, suporte e requisitos conhecidos',
      'propor estrutura',
      'redigir por seção',
      'apontar argumentos contrários e lacunas',
      'validar handoff',
    ],
  },
  review_text: {
    objective: 'Examinar texto identificado e apontar objeções, suporte e lacunas.',
    contextRequirements: ['texto alvo e revisão', 'objetivo da revisão', 'fontes de confronto disponíveis'],
    playbookId: 'review_text-playbook',
    dialogue: [
      {
        id: 'review-goal',
        prompt: 'Qual o foco da revisão?',
        options: ['Fundamentos e objeções', 'Fatos e fontes', 'Estrutura e clareza', 'Ainda não sei'],
        allowFreeText: true,
      },
    ],
    deliveryCriteria: [
      'alvo versionado',
      'problemas com referências ou lacunas explícitas',
      'limites de avaliação jurídica declarados',
    ],
    steps: [
      'fixar alvo',
      'examinar premissas e fontes',
      'procurar objeções e saltos lógicos',
      'conferir relação entre fundamento e pedido',
      'separar revisão editorial e jurídica',
      'validar handoff',
    ],
  },
} as const;
