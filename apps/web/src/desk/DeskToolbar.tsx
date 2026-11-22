import {
  FileText,
  ListChecks,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Plus,
  Search,
} from 'lucide-react';

export function DeskToolbar({
  historyCollapsed,
  historyInSidebar = false,
  caseSlotRef,
  onToggleHistory,
  onOpenQueue,
  onOpenResearch,
  onReopenPiece,
  hasPiece,
  pieceOpen,
  onCollapsePiece,
}: {
  historyCollapsed: boolean;
  /** Tema gelo: as conversas ficam na lateral do app, que tem o próprio botão de recolher. */
  historyInSidebar?: boolean;
  /** Tema gelo: onde o seletor de caso aparece no cabeçalho. */
  caseSlotRef?: (element: HTMLElement | null) => void;
  onToggleHistory: () => void;
  onOpenQueue: () => void;
  onOpenResearch: () => void;
  onReopenPiece: () => void;
  /** Há peça montada: o botão passa de “Nova peça” a “Abrir peça”. */
  hasPiece: boolean;
  pieceOpen: boolean;
  onCollapsePiece: () => void;
}) {
  return (
    <header className="flex min-h-11 flex-wrap items-center gap-2 border-b border-stone-200 px-4 text-[13px]">
      {!historyInSidebar && (
        <button
          type="button"
          aria-label={historyCollapsed ? 'Mostrar conversas' : 'Recolher conversas'}
          aria-expanded={!historyCollapsed}
          aria-controls="desk-conversations"
          onClick={onToggleHistory}
          className="hidden rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:block"
        >
          {historyCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      )}
      {caseSlotRef && <div ref={caseSlotRef} className="min-w-0 py-1" />}
      <span className="mr-auto" />
      <button
        type="button"
        aria-label="Pendências de revisão"
        title="Pendências de revisão"
        className="grid size-8 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
        onClick={onOpenQueue}
      >
        <ListChecks size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Pesquisa e fontes"
        title="Pesquisa e fontes"
        onClick={onOpenResearch}
        className="grid size-8 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
      >
        <Search size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={hasPiece ? 'Abrir peça' : 'Nova peça'}
        title={hasPiece ? 'Abrir peça' : 'Nova peça'}
        onClick={onReopenPiece}
        className="grid size-8 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      {pieceOpen && (
        <button
          type="button"
          aria-label="Recolher peça"
          onClick={onCollapsePiece}
          className="grid size-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
        >
          <PanelRightClose size={18} />
        </button>
      )}
    </header>
  );
}

export function DeskMobileTabs({
  mobile,
  onChange,
}: {
  mobile: 'chat' | 'piece';
  onChange: (tab: 'chat' | 'piece') => void;
}) {
  return (
    <nav aria-label="Áreas da mesa" className="flex justify-center gap-2 border-b border-stone-200 p-2 lg:hidden">
      <button
        type="button"
        aria-pressed={mobile === 'chat'}
        onClick={() => onChange('chat')}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 aria-pressed:bg-stone-200"
      >
        <MessageSquare size={16} />
        Conversa
      </button>
      <button
        type="button"
        aria-pressed={mobile === 'piece'}
        onClick={() => onChange('piece')}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 aria-pressed:bg-stone-200"
      >
        <FileText size={16} />
        Peça
      </button>
    </nav>
  );
}
