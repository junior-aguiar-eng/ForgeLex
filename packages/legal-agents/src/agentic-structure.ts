import { z } from 'zod';
import { AgenticTaskActionSchema, StructureAdjustmentSchema } from '@forgelex/domain';
import type { CaseTaskRole } from './agentic-case-contracts.js';
import { TaskCapabilityRequestSchema } from './agentic-case-graph.js';
import { DeliveryTaskPlanSchema } from './agentic-delivery.js';
import { EvidenceTaskResultSchema } from './agentic-evidence.js';
import { FOCUSED_VERIFIER_TASK_POLICY, focusedVerifierTaskProfile } from './agentic-focused-verifier.js';

/** Contract v13: adjusting the case structure through the conversation. No research, norm or procedure. */
export const StructureTaskPlanSchema = DeliveryTaskPlanSchema.omit({
  documentMode: true,
  documentPurpose: true,
  documentType: true,
}).extend({
  action: AgenticTaskActionSchema.extract(['adjust_structure']),
  requiresCaseLaw: z.literal(false),
  requiresNorms: z.literal(false),
  requiresProcedure: z.literal(false),
});
export type StructureTaskPlan = z.infer<typeof StructureTaskPlanSchema>;

/** Specialist output in v13: no matrix, no document, no extra capability; the analyst also returns the adjustment. */
export function structureTaskResultSchema(role: CaseTaskRole) {
  const base = EvidenceTaskResultSchema.omit({ evidenceAnalysis: true, document: true }).extend({
    capabilityRequests: z.array(TaskCapabilityRequestSchema).max(0).optional(),
  });
  return role === 'matter-analyst' ? base.extend({ structureAdjustment: StructureAdjustmentSchema }) : base;
}

export const STRUCTURE_TASK_POLICY = { ...FOCUSED_VERIFIER_TASK_POLICY, version: '1.14.0' } as const;
const instructions: Partial<Record<CaseTaskRole, string>> = {
  'legal-orchestrator':
    ' Planejar uma única questão sobre o ajuste pedido, com requiresCaseLaw, requiresNorms e requiresProcedure falsos. Se a referência do usuário a um item for ambígua ou não corresponder a nenhum item da lista (por exemplo, "o fato 3" quando não há fato 3), registrar lacuna material BLOCKING com pergunta neutra, oferecendo os itens candidatos como opções quando houver. Não adivinhar o item.',
  'matter-analyst':
    ' Emitir structureAdjustment com commands e caseSummary. ALTERAR {itemId, texto?, dataEvento?} e REMOVER {itemId} usam somente o id exato de um item da lista; dataEvento só em item TIMELINE, no formato AAAA-MM-DD, e só com data informada pelo usuário. ACRESCENTAR {texto, frase} só para o que o usuário afirma e não consta da lista, sem fonte: frase copia o trecho do pedido que o originou. Item acrescentado é alegação do usuário a confirmar, nunca prova. Quando a referência for ambígua, omitir o comando e explicar a dúvida em findings; se nenhum comando for seguro, devolver commands vazio. Não alterar item marcado decided. caseSummary é um parágrafo curto, em português claro, que resume o caso conforme a estrutura ajustada, distingue alegação de documento e não afirma que algo está provado.',
  'adversarial-reviewer':
    ' Conferir proposedStructureAdjustment contra a lista de itens e o pedido do usuário: cada itemId deve existir na lista; cada comando deve corresponder ao que o usuário pediu; ACRESCENTAR não pode duplicar item existente nem transformar relato em prova; caseSummary não pode afirmar fato provado nem trazer fato ausente da lista e do pedido. Registrar os problemas em findings com fontes; não reemitir comandos nem resumo.',
};
/** New profile only: the v8 chain stays byte-for-byte stable, as do v9-v12 and their hashes. */
export function structureTaskProfile(role: CaseTaskRole) {
  const prior = focusedVerifierTaskProfile(role);
  return {
    ...prior,
    version: '1.14.0',
    policyVersion: STRUCTURE_TASK_POLICY.version,
    instructions:
      prior.instructions +
      ' Protocolo de ajuste da estrutura v13: a ação é sempre adjust_structure. A fonte PREVIOUS_DELIVERY cujo id começa com "structure:" lista os itens da análise vigente do caso, com id, label (F1, P1...), kind, text e datas; a fonte USER_TEXT é o pedido de correção. A lista é resultado de análise anterior, e o pedido e o relato do usuário não são prova documental. Não inventar fatos, datas ou documentos e nunca marcar algo como provado, confirmado ou aprovado. Não emitir evidenceAnalysis nem documento.' +
      (instructions[role] ?? ''),
  };
}
/** Sent explicitly by the Estrutura tab; deliberately absent from the composer's public action list. */
export const STRUCTURE_TASK_ACTION = { id: 'adjust_structure' as const, label: 'Ajustar a estrutura' };
