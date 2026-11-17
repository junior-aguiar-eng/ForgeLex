import React from 'react';
import { Menu, Scale } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Cabeçalho do tema gelo (V2): só a marca e, abaixo de `lg`, o botão da gaveta. A navegação, a conta e a saída estão na
 * lateral; nenhum item aqui leva a uma ferramenta removida. Translúcido, como no protótipo.
 */
export const IceHeader: React.FC<{ menuOpen: boolean; onMenuToggle: () => void }> = ({ menuOpen, onMenuToggle }) => {
  const { setActiveTab } = useApp();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-2 lg:px-6">
        <button
          type="button"
          onClick={() => setActiveTab('landing')}
          className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-[var(--fl-radius-control)] pr-2"
          aria-label="ForgeLex, ir para o início"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--fl-radius-control)] bg-accent text-surface">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-editorial truncate text-xl font-semibold tracking-tight text-ink">ForgeLex</span>
        </button>
        <button
          id="forgelex-menu-toggle"
          type="button"
          onClick={onMenuToggle}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--fl-radius-control)] border border-line-control px-3 text-sm font-semibold text-ink-soft hover:bg-surface-muted lg:hidden"
          aria-label={menuOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
          aria-expanded={menuOpen}
          aria-controls="forgelex-sidebar"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Menu</span>
        </button>
      </div>
    </header>
  );
};
