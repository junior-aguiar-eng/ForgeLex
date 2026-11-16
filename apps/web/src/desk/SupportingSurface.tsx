import type { ReactNode } from 'react';
import { CanvasDialog } from '../screens/draft-review/DraftCanvas';

/** Fontes e conferência da conversa: em diálogo quando `modal`; sem moldura, os filhos aparecem direto. */
export function SupportingSurface({
  modal,
  onClose,
  children,
}: {
  modal: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return modal ? (
    <CanvasDialog title="Fontes e conferência" onClose={onClose}>
      {children}
    </CanvasDialog>
  ) : (
    <>{children}</>
  );
}
