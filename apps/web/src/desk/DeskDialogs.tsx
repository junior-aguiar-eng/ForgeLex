import { lazy, Suspense } from 'react';
import { CanvasDialog } from '../screens/draft-review/DraftCanvas';
import { ScreenLoadBoundary } from '../components/ScreenLoadBoundary';
import { DeskCaseSources } from '../research/DeskCaseSources';
import { DashboardScreen } from '../screens/DashboardScreen';
import type { ReviewQueueItem } from '../operations/contracts';

const ResearchDeskScreen = lazy(() =>
  import('../screens/ResearchDeskScreen').then(({ ResearchDeskScreen }) => ({ default: ResearchDeskScreen })),
);

export function DeskSourcesDialog({
  kind,
  sourceKey,
  matterId,
  onClose,
}: {
  kind: 'research' | 'case';
  sourceKey: string;
  matterId?: string;
  onClose: () => void;
}) {
  return (
    <CanvasDialog
      title={kind === 'research' ? 'Pesquisa e fontes' : 'Fontes do caso'}
      onClose={onClose}
      wide={kind === 'research'}
    >
      {kind === 'research' ? (
        <ScreenLoadBoundary fallback={<p role="alert">Não foi possível abrir a pesquisa.</p>}>
          <Suspense fallback={<p role="status">Carregando pesquisa…</p>}>
            <ResearchDeskScreen compact pieceMatterId={matterId} />
          </Suspense>
        </ScreenLoadBoundary>
      ) : (
        matterId && <DeskCaseSources key={sourceKey} matterId={matterId} />
      )}
    </CanvasDialog>
  );
}

export function DeskQueueDialog({
  error,
  onClose,
  onOpenDraft,
}: {
  error: string;
  onClose: () => void;
  onOpenDraft: (item: ReviewQueueItem) => void;
}) {
  return (
    <CanvasDialog title="Revisão do caso" onClose={onClose}>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      <DashboardScreen compact onOpenDraft={onOpenDraft} />
    </CanvasDialog>
  );
}
