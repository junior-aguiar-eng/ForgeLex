import type { CaseTaskRole } from './agentic-case-contracts.js';
import { STRUCTURE_DRAFT_TASK_POLICY, structureDraftProfile } from './agentic-structure-draft.js';

/** Contract v15: the v14 behaviour plus the analyst's identification of the document (piece type and parties). */
export const DOCUMENT_PROFILE_TASK_POLICY = { ...STRUCTURE_DRAFT_TASK_POLICY, version: '1.16.0' } as const;

const PROTOCOL =
  ' Protocolo de identificação do documento v15: na análise de fatos e provas, o matter-analyst devolve também documentProfile com pieceType (rótulo curto da peça, como "Petição inicial", "Sentença" ou "Contrato"), pieceTypeCertainty ("IDENTIFICADA" só quando o próprio texto mostra qual é a peça; "INCERTA" quando o texto é relato, mensagem ou trecho sem natureza clara, caso em que pieceType pode ser omitido) e parties (até 10, com name, role como autor, réu, locador, testemunha ou terceiro, sourceId da fonte, start e a quote literal copiada do texto, na posição indicada). Só entram partes que o texto nomeia; nunca inventar parte, papel ou peça. O texto do anexo e o relato do usuário não são prova.';

/** New profile only: v1-v14 and their hashes stay byte-for-byte stable. */
export function documentProfileProfile(role: CaseTaskRole) {
  const prior = structureDraftProfile(role);
  return {
    ...prior,
    version: '1.16.0',
    policyVersion: DOCUMENT_PROFILE_TASK_POLICY.version,
    instructions: prior.instructions + PROTOCOL,
  };
}
