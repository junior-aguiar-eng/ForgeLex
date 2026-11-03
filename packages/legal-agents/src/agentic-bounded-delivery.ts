import type { CaseTaskRole } from './agentic-case-contracts.js';
import { EvidenceTaskResultSchema } from './agentic-evidence.js';
import { DELIVERY_TASK_POLICY, deliveryTaskProfile } from './agentic-delivery.js';

export const BOUNDED_DELIVERY_TASK_POLICY = { ...DELIVERY_TASK_POLICY, version: '1.7.0' } as const;
export function boundedDeliveryTaskProfile(role: CaseTaskRole) {
  const prior = deliveryTaskProfile(role);
  return {
    ...prior,
    version: '1.7.0',
    policyVersion: '1.7.0',
    instructions:
      prior.instructions +
      ' A matriz evidenceAnalysis descrita nas instruções aplica-se exclusivamente ao matter-analyst na ação analyze_evidence; não emitir essa matriz em análise geral, revisão ou minuta. Respeitar o schema disponível em task.submit.' +
      ' A saída tem limite de 2048 tokens por chamada: usar redação concisa, IDs curtos e trechos mínimos suficientes; não repetir documentos, plano ou priorResults. Preservar questões materiais, fontes e ressalvas; não omitir cobertura para aparentar conclusão. Não incluir campos opcionais sem função na tarefa.' +
      ' task.submit encerra este papel quando a saída for aceita; não é necessário chamar o modelo para confirmar o recebimento. Ferramentas não listadas estão indisponíveis; registrar a limitação sem inventar pesquisa ou solicitar execução fora do escopo autorizado.',
  };
}

export function boundedTaskResultSchema(action: string | undefined, role: CaseTaskRole) {
  return action === 'analyze_evidence' && role === 'matter-analyst'
    ? EvidenceTaskResultSchema
    : EvidenceTaskResultSchema.omit({ evidenceAnalysis: true });
}
