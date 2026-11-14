import type { ReactNode } from 'react';

/**
 * Casca da Mesa: três áreas (conversas à esquerda, conversa no centro, peça à direita sob demanda) e a alternância
 * Conversa/Peça abaixo de `lg`. Só posiciona o que recebe; o estado e as regras ficam em `WritingDeskScreen`.
 */
export function DeskShell({
  toolbar,
  mobileTabs,
  historyRef,
  historyCollapsed,
  open,
  mobile,
  conversation,
  piece,
  overlays,
}: {
  toolbar: ReactNode;
  mobileTabs: ReactNode;
  historyRef: (element: HTMLElement | null) => void;
  historyCollapsed: boolean;
  open: boolean;
  mobile: 'chat' | 'piece';
  conversation: ReactNode;
  /** Presente só quando há peça montada; `open` decide se aparece. */
  piece: ReactNode;
  overlays: ReactNode;
}) {
  return (
    <div className="min-w-0" data-writing-desk>
      {toolbar}
      {open && mobileTabs}
      {/* Com a peça aberta, o histórico só aparece em telas largas (xl): a conversa e a peça precisam do espaço. */}
      <div
        className={`min-w-0 ${historyCollapsed ? '' : open ? 'xl:grid xl:grid-cols-[224px_minmax(0,1fr)]' : 'lg:grid lg:grid-cols-[224px_minmax(0,1fr)]'}`}
      >
        <aside
          id="desk-conversations"
          aria-label="Histórico de conversas"
          ref={historyRef}
          className={`${historyCollapsed ? 'hidden' : open ? 'hidden xl:block' : 'hidden lg:block'} min-w-0 border-r border-stone-200 bg-stone-50/60 px-3 py-5 lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto`}
        />
        <div
          className={
            open ? 'grid min-w-0 lg:grid-cols-[minmax(400px,1fr)_minmax(0,1.1fr)]' : 'mx-auto w-full max-w-4xl'
          }
        >
          {/* Sem altura fixa nem rolagem própria: a página rola uma vez só e a peça acompanha, fixa ao lado. */}
          <div className={`${open && mobile === 'piece' ? 'hidden lg:block' : ''} min-w-0`}>{conversation}</div>
          {piece && (
            <div
              style={!open ? { display: 'none' } : undefined}
              className={`${mobile === 'chat' ? 'hidden lg:block' : ''} min-w-0 border-l border-stone-200 lg:sticky lg:top-0 lg:self-start`}
            >
              {piece}
            </div>
          )}
        </div>
      </div>
      {overlays}
    </div>
  );
}
