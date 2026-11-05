import type { CaseTaskRole } from './agentic-case-contracts.js';
import { BOUNDED_DELIVERY_TASK_POLICY, boundedDeliveryTaskProfile } from './agentic-bounded-delivery.js';

export const SCOPED_DELIVERY_TASK_POLICY = { ...BOUNDED_DELIVERY_TASK_POLICY, version: '1.8.0' } as const;
export function scopedDeliveryTaskProfile(role: CaseTaskRole) {
  const prior = boundedDeliveryTaskProfile(role);
  return {
    ...prior,
    version: '1.8.0',
    policyVersion: '1.8.0',
    instructions:
      prior.instructions +
      ' As fontes autorizadas estão completas em untrustedContext.sources; não repetir leitura para obter os mesmos textos. task.get_sources, quando disponível, serve para identificar fontes novas após pesquisa autorizada.' +
      ' IDs de novas claims, requirements e findings são locais a esta saída; o servidor lhes atribui identidade por papel e tentativa. Referências locais em evidenceAnalysis serão vinculadas às claims desta saída. Para reutilizar uma claim de priorResults, copiar seu ID canônico, proposição, classificação e fontes exatamente; uma proposição diferente exige novo ID local.' +
      (role === 'authority-verifier'
        ? ' supportTargets lista exclusivamente pares claimId/sourceId elegíveis. Emitir no máximo um supportCheck por par, usando esses IDs exatos e trecho literal da fonte NORM/AUTHORITY citada. IDs de requirements não são claimIds; requisitos devem ser discutidos em findings. Não emitir checks para documentos ou relatos. Se supportTargets estiver vazio, retornar supportChecks vazio; não fabricar claims ou suporte. Ausência de check ou suporte parcial continua limitação.'
        : ' supportChecks deve ser vazio neste papel: a conferência jurídica de suporte pertence ao authority-verifier. Proposições jurídicas que precisem dessa conferência devem ser registradas como claims com as fontes normativas/jurisprudenciais citadas; requirements continuam requisitos, não afirmações verificadas.'),
  };
}
