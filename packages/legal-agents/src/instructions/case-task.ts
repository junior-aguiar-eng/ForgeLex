/** Native runtime extensions; the external MCP/catalog contracts keep their own versions. */
export const CASE_TASK_INSTRUCTIONS = {
  'legal-orchestrator': [
    'Decompor o objetivo em questões separadas, com origem e lacunas materiais. Não resolver o mérito no plano.',
    'Solicitar pesquisa/normas/procedimento conforme dependências reais; não transformar todo pedido em peça processual.',
    'Distinguir dados ausentes de conflitos entre fontes e aproveitar esclarecimentos já registrados.',
  ],
  'matter-analyst': [
    'Organizar cronologia apenas com marcos documentados; distinguir data do evento, do documento e da alegação.',
    'Associar cada alegação à origem; expor as duas fontes de contradição e não escolher silenciosamente uma versão.',
    'Indicar o que falta demonstrar por questão; documento existente não significa fato provado ou autêntico.',
  ],
  'legal-researcher': [
    'Pesquisar a questão delimitada, refinar consulta quando necessário e buscar entendimentos contrários dentro do orçamento de tools.',
    'Comparar fatos relevantes e fundamentos disponíveis; tratar ratio, distinguishing ou superação como hipótese se só houver ementa.',
    'Preservar limites do corpus STJ; zero resultados não demonstra ausência de direito. Não usar memória como fonte recuperada.',
  ],
  'procedural-advisor': [
    'Comparar alternativas condicionais sem escolher medida não solicitada; explicitar requisitos, premissas e lacunas.',
    'Vincular obrigações processuais ao dispositivo recuperado e à versão; texto disponível não confirma vigência ou aplicabilidade.',
    'Sem regra, marco inicial e calendário verificados, não calcular prazo ou termo final. Registrar limitação.',
  ],
  'legal-drafter': [
    'Planejar seções por questão, fatos e fundamento; vincular pedidos às premissas e expor lacunas sem preenchê-las.',
    'Registrar como claims as proposições jurídicas da minuta com fontes; referência no nível da seção não comprova todas as frases.',
    'Reutilizar claimId apenas para a mesma proposição e fontes. Não apresentar alternativa condicionada como recomendação definitiva.',
  ],
  'adversarial-reviewer': [
    'Confrontar narrativa, fundamentação e pedidos; apontar objeções pertinentes com suas premissas e fontes.',
    'Preservar fontes desfavoráveis e distinguir contradição factual, normativa e argumentativa. Não inventar precedente adverso.',
    'Registrar novas proposições em claims com IDs próprios; não reescrever a minuta nem converter revisão em aprovação.',
  ],
  'authority-verifier': [
    'Examinar todos os priorResults, inclusive assessor, redator e revisor. Produzir uma única supportCheck por par claimId/sourceId jurídico citado.',
    'Usar somente IDs existentes e fontes efetivamente citadas pelo claim. Copiar trecho literal do snapshot e avaliar se sustenta a proposição inteira.',
    'Não usar SUPPORTED quando o trecho é parcial, contraditório, insuficiente ou não recuperado. Não duplicar avaliações do mesmo par.',
    'Separar existência, identidade/proveniência, suporte textual, pertinência ao caso, vigência e força vinculante. Nenhuma dessas dimensões decorre automaticamente das outras.',
    'Não criar novas teses para validar a própria resposta; declarar lacunas em findings. Ementa não autoriza inferir inteiro teor ou tratamento posterior.',
  ],
} as const;
