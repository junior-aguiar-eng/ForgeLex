import { useEffect, useState } from 'react';
import { requestApi } from '../api-client';
import { structureReadingLine, type StructureReview } from '../desk/case-structure-model';

/**
 * Linha de leitura da estrutura do caso para a orientação guiada. Só leitura e sem estado de erro: sem caso, sem
 * estrutura ou com falha de rede, a linha simplesmente não aparece.
 */
export function useStructureLine(matterId: string | null | undefined): string | undefined {
  const [line, setLine] = useState<string | undefined>();
  useEffect(() => {
    setLine(undefined);
    if (!matterId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const found = await requestApi<{ structure: { deliveryId: string } | null }>(
          `/api/agentic/matters/${encodeURIComponent(matterId)}/structure`,
          { signal: controller.signal },
          { sessionOnly: true },
        );
        if (!found.structure) return;
        const review = await requestApi<StructureReview>(
          `/api/agentic/deliveries/${encodeURIComponent(found.structure.deliveryId)}/evidence-review`,
          { signal: controller.signal },
          { sessionOnly: true },
        );
        if (!controller.signal.aborted) setLine(structureReadingLine(review));
      } catch {
        // Sem a linha; a orientação segue como sempre.
      }
    })();
    return () => controller.abort();
  }, [matterId]);
  return line;
}
