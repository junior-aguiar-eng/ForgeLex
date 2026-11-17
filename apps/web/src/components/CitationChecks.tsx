import type { SearchResultItem } from '../operations/contracts';
import { activeTheme } from '../theme/active-theme';
import { VerificationSeal } from './ice/Seal';

const identityLabels: Record<SearchResultItem['verificationStatus'], string> = {
  VERIFIED_OFFICIAL: 'Conferida na fonte oficial.',
  VERIFIED_PROVIDER: 'Conferida no fornecedor informado.',
  UNVERIFIED: 'A conferir na fonte.',
  CONFLICTING_METADATA: 'Há divergência nos metadados.',
  NOT_FOUND: 'Decisão não localizada na fonte consultada.',
};

export function CitationChecks({ identity }: { identity?: SearchResultItem['verificationStatus'] }) {
  // Tema gelo: o estado da identidade vira o selo (ícone e texto), com a mesma frase ao lado.
  const ice = activeTheme() === 'gelo';
  return (
    <dl className="space-y-1 text-xs text-stone-600">
      {identity && (
        <div>
          <dt className="inline font-semibold">Identidade do julgado. </dt>
          {ice ? (
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <VerificationSeal status={identity} />
              <span>{identityLabels[identity]}</span>
            </dd>
          ) : (
            <dd className="inline">{identityLabels[identity]}</dd>
          )}
        </div>
      )}
      <div>
        <dt className="inline font-semibold">Fidelidade da citação. </dt>
        <dd className="inline">Compare o trecho citado com o texto da fonte.</dd>
      </div>
      <div>
        <dt className="inline font-semibold">Aplicabilidade ao caso. </dt>
        <dd className="inline">Avalie os fundamentos e os fatos do caso.</dd>
      </div>
    </dl>
  );
}
