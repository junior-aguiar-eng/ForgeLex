import type { SearchResultItem, TribunalCapability } from '../operations/contracts';

type SearchState =
  | { state: 'idle' | 'loading' | 'unavailable' | 'error' }
  | { state: 'ready'; chargedCents: number; resultCount: number; isReplay: boolean };

const verificationLabels: Record<SearchResultItem['verificationStatus'], string> = {
  VERIFIED_OFFICIAL: 'Verificado na fonte oficial',
  VERIFIED_PROVIDER: 'Verificado pelo provedor',
  UNVERIFIED: 'Não verificado',
  CONFLICTING_METADATA: 'Metadados conflitantes',
  NOT_FOUND: 'Não localizado',
};

export function createResearchDeskModel(input: {
  tribunals: TribunalCapability[];
  search: SearchState;
  verificationStatus?: SearchResultItem['verificationStatus'];
}) {
  const courts = input.tribunals.filter((court) => court.searchable);
  const completedEmpty = input.search.state === 'ready' && input.search.resultCount === 0;
  const billingMessage = input.search.state === 'ready'
    ? input.search.isReplay
      ? 'Resultado reapresentado por replay idempotente, sem nova cobrança.'
      : input.search.chargedCents > 0
        ? `Operação concluída com cobrança de R$ ${(input.search.chargedCents / 100).toFixed(2).replace('.', ',')}.`
        : 'Operação concluída sem cobrança.'
    : undefined;
  return {
    courts,
    canSearch: courts.length > 0,
    verificationActionLabel: 'Verificar gratuitamente',
    emptyMessage: completedEmpty ? 'A operação concluída não localizou resultados para esta consulta.' : undefined,
    billingMessage,
    verificationStatusLabel: input.verificationStatus ? verificationLabels[input.verificationStatus] : undefined,
  };
}
