import type { CaseTaskRole } from './agentic-case-contracts.js';
import { SCOPED_DESK_EDIT_POLICY, scopedDeskEditProfile } from './agentic-guided-desk.js';

/** Contract v14: the v12 guided desk plus the use of the case structure when drafting. */
export const STRUCTURE_DRAFT_TASK_POLICY = { ...SCOPED_DESK_EDIT_POLICY, version: '1.15.0' } as const;

const PROTOCOL =
  ' Protocolo de estrutura na redação v14: a fonte PREVIOUS_DELIVERY cujo id começa com "structure-context:" traz o resumo do caso e os itens da estrutura (id, label, kind, classification, text, state). state CONFIRMADO é item que o usuário já conferiu; A_CONFIRMAR é item que o usuário da Mesa ainda não conferiu. Os dois são contexto de análise, nunca prova, lei ou jurisprudência, e nada ali está provado. Quando a ação for analyze_evidence, ignorar essa fonte.';

const instructions: Partial<Record<CaseTaskRole, string>> = {
  'legal-orchestrator':
    ' A estrutura do caso não muda a ação nem o tipo de peça escolhidos pelo usuário; use-a só para entender o caso.',
  'legal-drafter':
    ' Redigir a peça na voz e na pessoa que a peça pede (como a parte, por seu advogado). Nunca escrever "segundo o cliente", "conforme alegado" nem narrar em terceira pessoa por causa do estado do item. Usar os itens CONFIRMADO e A_CONFIRMAR no texto como qualquer fato do caso, sem apresentá-los como provados e sem inventar fato, data ou documento que não esteja na fonte. Devolver em structureUse os itemId (e o label) dos itens A_CONFIRMAR em que a peça se apoia, omitindo structureUse quando não se apoiar em nenhum; nunca listar item CONFIRMADO nem id que não esteja na fonte. Lacuna que impeça a peça vira pergunta objetiva ao usuário, não preenchimento por suposição.',
  'adversarial-reviewer':
    ' Conferir se a minuta usa item A_CONFIRMAR sem listá-lo em structureUse e se apresenta qualquer item da estrutura como provado; apontar como achado.',
};

/** New profile only: v1-v13 and their hashes stay byte-for-byte stable. */
export function structureDraftProfile(role: CaseTaskRole) {
  const prior = scopedDeskEditProfile(role);
  return {
    ...prior,
    version: '1.15.0',
    policyVersion: STRUCTURE_DRAFT_TASK_POLICY.version,
    instructions: prior.instructions + PROTOCOL + (instructions[role] ?? ''),
  };
}
