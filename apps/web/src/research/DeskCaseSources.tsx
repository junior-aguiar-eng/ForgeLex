import { useEffect, useState } from 'react';
import { requestApi } from '../api-client';
import { CaseAuthorities, type SavedCaseAuthority } from '../components/CaseAuthorities';

export function DeskCaseSources({ matterId }: { matterId: string }) {
  const [result, setResult] = useState<{ items: SavedCaseAuthority[] } | { error: string }>();

  useEffect(() => {
    const controller = new AbortController();
    void requestApi<{ items: SavedCaseAuthority[] }>(`/api/v2/matters/${encodeURIComponent(matterId)}/authorities`, {
      signal: controller.signal,
      cache: 'no-store',
    }).then(
      (response) => {
        if (!controller.signal.aborted) setResult(response);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            error: failure instanceof Error ? failure.message : 'Não foi possível abrir as fontes do caso.',
          });
      },
    );
    return () => controller.abort();
  }, [matterId]);

  if (!result) return <p role="status">Carregando fontes do caso…</p>;
  if ('error' in result)
    return (
      <p role="alert" className="text-amber-800">
        {result.error}
      </p>
    );
  return <CaseAuthorities items={result.items} />;
}
