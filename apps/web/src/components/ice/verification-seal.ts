import type { SearchResultItem } from '../../operations/contracts';

/**
 * Linguagem visual dos selos (V4, tema gelo): a verificação é um fato da fonte e tem seus próprios estados; a análise
 * da IA é outra coisa, sempre rotulada (ver `Seal`). Só a conferência na fonte oficial é "Verificada"; qualquer outro
 * estado, ou a falta dele, nunca aparece como sucesso.
 */
export type SealTone = 'ok' | 'neutral' | 'warn' | 'danger';

export interface VerificationSealModel {
  label: string;
  detail: string;
  tone: SealTone;
}

export function verificationSeal(status: SearchResultItem['verificationStatus'] | undefined): VerificationSealModel {
  switch (status) {
    case 'VERIFIED_OFFICIAL':
      return { label: 'Verificada', detail: 'Número, data e órgão conferidos na fonte oficial.', tone: 'ok' };
    case 'VERIFIED_PROVIDER':
      return {
        label: 'Conferida no fornecedor',
        detail: 'Conferida no fornecedor informado, não na fonte oficial.',
        tone: 'warn',
      };
    case 'CONFLICTING_METADATA':
      return {
        label: 'Metadados divergentes',
        detail: 'Há divergência nos metadados. Confira na fonte.',
        tone: 'warn',
      };
    case 'NOT_FOUND':
      return {
        label: 'Sem correspondência',
        detail: 'Não encontrada na fonte consultada. Isso não prova que não exista.',
        tone: 'danger',
      };
    default:
      return { label: 'A conferir na fonte', detail: 'Ainda não conferida na fonte oficial.', tone: 'neutral' };
  }
}
