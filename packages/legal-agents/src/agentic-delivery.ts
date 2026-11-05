import { z } from 'zod';
import { TaskPlanSchema, type CaseTaskRole } from './agentic-case-contracts.js';
import {
  APPROVED_CASE_TASK_POLICY,
  ApprovedCaseTaskPlanSchema,
  approvedCaseTaskProfile,
} from './agentic-approved-case.js';

// Absent classification keeps the conservative historical behavior; never default to a limited delivery.
export const DeliveryTaskPlanSchema = ApprovedCaseTaskPlanSchema.extend({
  gaps: z
    .array(
      TaskPlanSchema.shape.gaps.element.extend({
        deliveryImpact: z.enum(['BLOCKING', 'LIMITATION']).optional(),
      }),
    )
    .max(10),
});
export type DeliveryTaskPlan = z.infer<typeof DeliveryTaskPlanSchema>;
export const DELIVERY_TASK_POLICY = { ...APPROVED_CASE_TASK_POLICY, version: '1.6.0' } as const;

/** New tasks only; v1-v4 instructions and contract hashes remain unchanged. */
export function deliveryTaskProfile(role: CaseTaskRole) {
  const prior = approvedCaseTaskProfile(role);
  return {
    ...prior,
    version: '1.6.0',
    policyVersion: DELIVERY_TASK_POLICY.version,
    instructions:
      prior.instructions +
      (role === 'legal-orchestrator'
        ? ' Distinguir relevância da lacuna (material) de impedimento à entrega (deliveryImpact). Em cada lacuna relevante preencher BLOCKING somente quando não for possível atender ao pedido, mesmo com ressalvas, sem inventar fato, escolher objetivo/medida não autorizados ou calcular prazo sem dados indispensáveis. LIMITATION quando for possível analisar o material, corrigir o texto ou produzir a minuta preliminar solicitada indicando expressamente o que não está demonstrado. Falta de prova de pagamento não impede corrigir afirmação indevida de quitação; falta de demonstração de urgência não impede minuta limitada que marque requisitos pendentes, sem prometer concessão. Conflito entre fontes pode ser exposto com as duas versões, sem escolher uma. Em reason indicar a informação ausente ou conflitante e qual conclusão fica limitada; não declarar que a lacuna impede o pedido quando apenas impede uma conclusão definitiva. Para BLOCKING formular pergunta neutra e objetiva com opções quando cabíveis; aproveitar respostas existentes. Não usar esta classificação para contornar autorização, aprovação de fatos/provas, fontes revogadas, orçamento ou revisão humana.'
        : ' Preservar no resultado e nas seções pertinentes as lacunas deliveryImpact LIMITATION do plano, com suas fontes. Não preencher dados ausentes nem converter ressalva em fato provado. Entregar o conteúdo possível do pedido sem decidir pontos que permanecem desconhecidos. A classificação da lacuna não altera permissões, orçamento nem necessidade de aprovação humana.') +
      ' Perguntas e ressalvas devem usar linguagem clara e objetiva sobre o caso, sem nomes de agentes, campos internos, enums ou etapas de engenharia.',
  };
}
