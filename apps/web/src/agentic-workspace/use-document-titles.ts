import { useEffect, useState } from 'react';
import { requestApi } from '../api-client';

/** Document titles of a case, so sources are named the way the lawyer knows them. Failure leaves generic names. */
export function useDocumentTitles(matterId: string | null, enabled: boolean): Record<string, string> {
  const [titles, setTitles] = useState<{ matterId: string; byId: Record<string, string> }>();
  useEffect(() => {
    if (!matterId || !enabled) return;
    let active = true;
    requestApi<{ documents: { id: string; title: string }[] }>(
      `/api/v2/matters/${encodeURIComponent(matterId)}`,
      {},
      { sessionOnly: true },
    )
      .then((r) => {
        if (active) setTitles({ matterId, byId: Object.fromEntries(r.documents.map((d) => [d.id, d.title])) });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [matterId, enabled]);
  return titles?.matterId === matterId ? titles.byId : {};
}
