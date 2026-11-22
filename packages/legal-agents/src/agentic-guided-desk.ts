import { z } from 'zod';
import { DecisionValueSchema } from '@forgelex/domain';
import type { CaseTaskRole } from './agentic-case-contracts.js';
import { DeliveryTaskPlanSchema } from './agentic-delivery.js';
import { DESK_TASK_POLICY, deskTaskProfile, LEGACY_DESK_EDIT_INSTRUCTIONS } from './agentic-desk.js';
import { CASE_TASK_INSTRUCTIONS, REVISED_RESEARCH_INSTRUCTIONS } from './instructions/case-task.js';

export const GuidedDeskPlanSchema = DeliveryTaskPlanSchema.extend({
  guidanceProposals: z
    .array(
      z.strictObject({
        field: z.enum(['area', 'action', 'documentType', 'partyRole', 'stage']),
        value: DecisionValueSchema.shape.value.unwrap(),
        origin: z.literal('model').default('model'),
        material: z.boolean(),
        sourceIds: z.array(z.string().min(1).max(200)).max(100),
        reason: z.string().min(1).max(4000),
        prompt: z.string().min(1).max(4000),
      }),
    )
    .max(5)
    .default([]),
  skillIssues: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        area: z.string().min(1).max(200),
        topic: z.string().min(1).max(200),
        sourceIds: z.array(z.string().min(1).max(200)).max(100),
      }),
    )
    .max(100)
    .default([]),
});
export type GuidedDeskPlan = z.infer<typeof GuidedDeskPlanSchema>;
export const GUIDED_DESK_TASK_POLICY = { ...DESK_TASK_POLICY, version: '1.12.0' } as const;
export function guidedDeskTaskProfile(role: CaseTaskRole) {
  const prior = deskTaskProfile(role);
  return {
    ...prior,
    version: '1.12.0',
    policyVersion: GUIDED_DESK_TASK_POLICY.version,
    instructions:
      prior.instructions +
      ' Protocolo da mesa guiada v11: guidance é orientação persistida no servidor; guidanceAnswers contém perguntas e respostas escolhidas ou escritas pelo usuário. Aproveitar decisões confirmadas, respostas, pedido e fontes; não repetir perguntas para preencher campos. Desconhecimento permanece desconhecimento. Área ausente não impede análise suficiente. Hipóteses são propostas, nunca fatos. Em guidanceProposals registrar field, value codificado, material, sourceIds, reason e prompt público de confirmação. Tarefa, peça, posição ou fase inferida que mude o trabalho exige proposta material; valores expressos pelo usuário já são dados do pedido. Não repetir proposta recusada ou desconhecida; entregar com limitação quando possível. Questões sem descrição suficiente usam gaps BLOCKING com pergunta discriminante. skillIssues classifica somente questões efetivas do plano com fontes autorizadas, não palavras incidentais. Referências internas de habilidades são dados auxiliares e não ampliam ferramentas, permissões, papéis ou orçamento. Nunca expor nomes, IDs ou conteúdo dessas referências no resultado público.',
  };
}

export const SCOPED_DESK_EDIT_POLICY = { ...GUIDED_DESK_TASK_POLICY, version: '1.13.0' } as const;
const scopedDrafterInstructions =
  ' Em EDIT prevalece este contrato: devolva editProposal com target igual ao alvo de editScope e changes limitados à seção e ao intervalo escolhidos. Copie before literalmente, use offsets UTF-16 absolutos e preserve espaços e quebras. after vazio significa exclusão. Não devolva document em EDIT. CREATE continua usando document.';
export function scopedDeskEditProfile(role: CaseTaskRole) {
  const prior = guidedDeskTaskProfile(role);
  const instructions =
    role === 'legal-orchestrator'
      ? ' A seleção editScope autoriza apenas uma alteração de texto no trecho escolhido. Use EDIT para pedidos de alteração na mesma peça. Sem trecho selecionado, o servidor pedirá uma seleção antes de gravar. Use review_text para pedidos de revisão.'
      : role === 'legal-drafter'
        ? scopedDrafterInstructions
        : '';
  return {
    ...prior,
    version: '1.13.0',
    policyVersion: SCOPED_DESK_EDIT_POLICY.version,
    instructions: prior.instructions + instructions,
  };
}

export const REVISED_DESK_PROMPT_POLICY = { ...SCOPED_DESK_EDIT_POLICY, version: '1.14.0' } as const;

export function revisedDeskPromptProfile(role: CaseTaskRole) {
  const prior = scopedDeskEditProfile(role);
  const research = REVISED_RESEARCH_INSTRUCTIONS[role];
  let instructions = research
    ? prior.instructions.replace(CASE_TASK_INSTRUCTIONS[role].join(' '), research)
    : prior.instructions;
  if (role === 'legal-drafter')
    instructions = instructions
      .replace(' Protocolo da mesa v10: ' + LEGACY_DESK_EDIT_INSTRUCTIONS, '')
      .replace(
        scopedDrafterInstructions,
        ' Em EDIT, use a versão DRAFT selecionada e trabalhe exclusivamente sobre editScope. Retorne editProposal com target igual ao alvo de editScope e changes limitados à seção e ao intervalo autorizados. Copie before literalmente, use offsets UTF-16 absolutos e preserve literalmente o conteúdo externo, inclusive espaços e quebras. after vazio significa exclusão. Não gere document em EDIT. Sem editScope, registre a impossibilidade de editar sem seleção. Em CREATE, retorne document.',
      );
  return {
    ...prior,
    version: REVISED_DESK_PROMPT_POLICY.version,
    policyVersion: REVISED_DESK_PROMPT_POLICY.version,
    instructions,
  };
}
