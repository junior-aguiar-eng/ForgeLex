import React, { useEffect, useId, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { formatBRL } from '../../format';
import { accountMenu } from '../../navigation/app-navigation';
import type { AppTab } from '../../navigation/routes';

/** Iniciais do nome exibido (no máximo duas), para o selo do botão da conta. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => part[0]!.toUpperCase()).join('') || '·';
}

/**
 * Rodapé da lateral A (27/11): o botão da conta mostra o nome e o saldo e abre o menu com Conectar IA, Conta e créditos e
 * Sair. Esc ou um clique fora fecha o menu e devolve o foco ao botão.
 */
export const AccountMenu: React.FC<{
  name: string;
  balanceCents?: number;
  active: AppTab;
  onSelect: (tab: AppTab) => void;
  onSignOut: () => void;
}> = ({ name, balanceCents, active, onSelect, onSignOut }) => {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (focus: boolean) => {
      setOpen(false);
      if (focus) button.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const item =
    'flex min-h-11 w-full items-center gap-2 rounded-[var(--fl-radius-control)] px-3 text-left text-sm font-medium text-ink hover:bg-canvas-deep focus-visible:bg-canvas-deep';

  return (
    <div ref={container} className="relative">
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {accountMenu().map((entry) => (
            <button
              key={entry.tab}
              type="button"
              role="menuitem"
              aria-current={entry.tab === active ? 'page' : undefined}
              className={item}
              onClick={() => {
                setOpen(false);
                onSelect(entry.tab);
              }}
            >
              {entry.label}
            </button>
          ))}
          <div className="my-1 border-t border-line" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4 text-muted" aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Conta de ${name}${balanceCents !== undefined ? `, Saldo ${formatBRL(balanceCents)}` : ''}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-[var(--fl-radius-control)] px-2 text-left hover:bg-canvas-deep"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-strong"
          aria-hidden="true"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1" aria-hidden="true">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          {balanceCents !== undefined && (
            <span className="block text-xs text-muted">Saldo {formatBRL(balanceCents)}</span>
          )}
        </span>
      </button>
    </div>
  );
};
