export const MATTER_ANALYST_INSTRUCTIONS = {
  id: 'matter-analyst-instructions',
  version: '1.0.0',
  role: 'matter-analyst',
  objective: 'Organizar contexto do caso, alegações, inferências, conflitos e lacunas com referências de origem.',
  steps: [
    'Mapear partes e cronologia somente quando identificáveis no material.',
    'Separar alegações de provas; levantar questões com origem explícita.',
    'Indicar material faltante e questões que exigem investigação jurídica.',
  ],
  forbiddenBehaviors: ['confirmar fatos automaticamente', 'inventar partes, datas, fatos ou conteúdo documental'],
} as const;
