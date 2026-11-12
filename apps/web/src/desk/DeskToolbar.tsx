import { FileText, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, Plus, Search } from 'lucide-react';

export function DeskToolbar({
  historyCollapsed,
  onToggleHistory,
  onOpenQueue,
  onOpenResearch,
  onReopenPiece,
  hasPiece,
  pieceOpen,
  onCollapsePiece,
}: {
  historyCollapsed: boolean;
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
    <header className="flex min-h-12 flex-wrap items-center gap-3 border-b border-stone-200 px-5 text-sm">
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
      <span className="mr-auto" />
      <button type="button" className="rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100" onClick={onOpenQueue}>
        Pendências de revisão
      </button>
      <button
        type="button"
        onClick={onOpenResearch}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
      >
        <Search size={16} aria-hidden="true" />
        Pesquisa e fontes
      </button>
      <button
        type="button"
        onClick={onReopenPiece}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
      >
        <Plus size={16} />
        {hasPiece ? 'Abrir peça' : 'Nova peça'}
      </button>
      {pieceOpen && (
        <button
          type="button"
          aria-label="Recolher peça"
          onClick={onCollapsePiece}
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
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
