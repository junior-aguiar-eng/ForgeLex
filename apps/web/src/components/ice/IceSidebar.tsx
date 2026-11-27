import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Cable,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { CASE_WORKSPACE_ENABLED, DESK_ENABLED } from '../../config/site-capabilities';
import { formatBRL } from '../../format';
import { highlightedTab, iceNavigation, type NavIcon, type NavItem } from '../../navigation/app-navigation';
import type { AppTab } from '../../navigation/routes';
import { consumeDeskEntry, requestDeskEntry } from '../../navigation/desk-entry';
import { AccountMenu } from './AccountMenu';
import { useDeskHistorySlot } from './desk-history-slot';
import { useBalanceCents } from './use-balance';
import { BrandLogo, BrandSymbol } from '../BrandLogo';

/**
 * Lateral da casca do tema gelo (protótipo de 09/11): a marca no alto, o grupo Trabalho (Mesa, Casos, Jurisprudência),
 * o grupo Conta e recursos e, no pé, o saldo. Na Mesa, as conversas recentes ficam dentro dela (V3). O cliente pode
 * recolhê-la em trilho de ícones e a escolha vale até a página recarregar. Abaixo de `lg` vira gaveta, aberta pelo botão
 * do cabeçalho.
 */

// Os ícones só aparecem no trilho; a lateral aberta é de texto, como no protótipo.
const ICONS: Record<NavIcon, LucideIcon> = {
  desk: FileText,
  cases: FolderOpen,
  research: BookOpen,
  overview: LayoutDashboard,
  progress: Search,
  connections: Cable,
  billing: WalletCards,
};

const MENU_TOGGLE = 'forgelex-menu-toggle';
const groupLabel = 'px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle';

const ItemButton: React.FC<{ item: NavItem; active: boolean; collapsed: boolean; onSelect: (tab: AppTab) => void }> = ({
  item,
  active,
  collapsed,
  onSelect,
}) => {
  const Icon = ICONS[item.icon];
  return (
    <button
      type="button"
      onClick={() => onSelect(item.tab)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--fl-radius-control)] px-3 text-left text-sm transition-colors ${
        active
          ? 'bg-accent-tint font-semibold text-accent-strong'
          : 'font-medium text-muted hover:bg-canvas-deep hover:text-ink'
      } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${collapsed ? '' : 'lg:hidden'}`} aria-hidden="true" />
      <span className={collapsed ? 'lg:sr-only' : ''}>{item.label}</span>
    </button>
  );
};

export const IceSidebar: React.FC<{
  activeTab: AppTab;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (tab: AppTab, mode?: 'push' | 'replace') => void;
}> = ({ activeTab, mobileOpen, onCloseMobile, onSelect }) => {
  const { account, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const { setElement: setHistorySlot } = useDeskHistorySlot();
  const navigation = React.useMemo(
    () => iceNavigation({ deskEnabled: DESK_ENABLED, casesEnabled: CASE_WORKSPACE_ENABLED }),
    [],
  );
  const active = highlightedTab(activeTab, DESK_ENABLED);
  const balance = useBalanceCents(activeTab);
  // Fora da Mesa, agir no histórico (abrir conversa, caso ou começar uma nova) é voltar à Mesa. O histórico chega por portal,
  // então o evento do React segue a árvore da Mesa: o ouvinte é nativo, no próprio elemento da lateral.
  const historyArea = React.useRef<HTMLDivElement>(null);
  const outsideDesk = React.useRef(false);
  outsideDesk.current = active !== 'work';
  const goToDesk = React.useRef(() => {});
  // A escolha da Mesa consome o pedido e navega numa entrada só (Voltar devolve à tela de onde se saiu). Se a Mesa não
  // escolher nada, a lateral vai à Mesa sozinha.
  goToDesk.current = () => {
    requestDeskEntry();
    onCloseMobile();
    window.setTimeout(() => {
      if (consumeDeskEntry()) onSelect('work');
    }, 0);
  };
  useEffect(() => {
    const area = historyArea.current;
    if (!area) return;
    const onClick = (event: MouseEvent) => {
      if (outsideDesk.current && (event.target as Element | null)?.closest('button')) goToDesk.current();
    };
    area.addEventListener('click', onClick, true);
    return () => area.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
        document.getElementById(MENU_TOGGLE)?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const select = (tab: AppTab) => {
    onSelect(tab);
    onCloseMobile();
    if (mobileOpen) document.getElementById(MENU_TOGGLE)?.focus();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu lateral"
        onClick={onCloseMobile}
        className={`fixed inset-0 z-40 bg-ink/20 lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}
      />
      <aside
        id="forgelex-sidebar"
        aria-label="Menu lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-[22px] border-r border-line bg-surface px-3.5 pb-5 pt-16 shadow-xl transition-transform duration-200 lg:visible lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0 lg:pt-[18px] lg:shadow-none ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-[248px]'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => select(DESK_ENABLED ? 'work' : 'landing')}
            className="hidden min-h-11 items-center gap-2.5 rounded-[var(--fl-radius-control)] px-1.5 text-ink lg:inline-flex"
            aria-label="ForgeLex, ir para o início"
          >
            {collapsed ? <BrandSymbol size={30} /> : <BrandLogo height={30} />}
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto min-h-11 min-w-11 rounded-[var(--fl-radius-control)] p-2 text-muted hover:bg-canvas-deep lg:hidden"
            aria-label="Fechar menu lateral"
          >
            <X className="mx-auto h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-[22px] overflow-y-auto">
          {navigation.work.length > 0 && (
            <nav aria-label="Navegação principal" className="space-y-0.5">
              <span className={`block ${groupLabel} ${collapsed ? 'lg:sr-only' : ''}`}>Trabalho</span>
              {navigation.work.map((item) => (
                <ItemButton
                  key={item.tab}
                  item={item}
                  active={item.tab === active}
                  collapsed={collapsed}
                  onSelect={select}
                />
              ))}
            </nav>
          )}
          {/* Regra do mínimo: com a Mesa, a conversa ocupa o alto da lateral; Conectar IA e Conta ficam abaixo, sem rótulo. */}
          {/* Lateral A (27/11): com a Mesa, as conversas e a Pasta ficam na lateral em qualquer tela. */}
          {DESK_ENABLED && (
            <div className={collapsed ? 'lg:hidden' : ''} ref={historyArea}>
              <aside aria-label="Histórico de conversas" ref={setHistorySlot} className="min-w-0" />
            </div>
          )}
          {navigation.resources.length > 0 && <nav aria-label="Conta e recursos" className="space-y-0.5">
            {!DESK_ENABLED && (
              <span className={`block ${groupLabel} ${collapsed ? 'lg:sr-only' : ''}`}>Conta e recursos</span>
            )}
            {navigation.resources.map((item) => (
              <ItemButton
                key={item.tab}
                item={item}
                active={item.tab === active}
                collapsed={collapsed}
                onSelect={select}
              />
            ))}
          </nav>}
          {/* A Mesa renderiza aqui a lista de conversas. No trilho recolhido não há espaço para ela. */}
          {!DESK_ENABLED && active === 'work' && (
            <div className={collapsed ? 'lg:hidden' : ''}>
              <aside aria-label="Histórico de conversas" ref={setHistorySlot} className="min-w-0" />
            </div>
          )}
        </div>

        {DESK_ENABLED ? (
          account && (
            <div className="flex shrink-0 items-center gap-1 border-t border-line pt-3">
              <div className="min-w-0 flex-1">
                <AccountMenu
                  name={account.user.displayName}
                  balanceCents={balance}
                  active={active}
                  onSelect={select}
                  onSignOut={() => void signOut()}
                />
              </div>
              {/* Recarregar fica a um clique, como antes do menu da conta (27/11). */}
              {balance !== undefined && active !== 'credits' && (
                <button
                  type="button"
                  onClick={() => select('credits')}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--fl-radius-control)] px-2 text-[13px] font-semibold text-accent hover:bg-canvas-deep hover:text-accent-strong"
                >
                  Recarregar
                </button>
              )}
            </div>
          )
        ) : (
        <div className="shrink-0 space-y-3">
          {balance !== undefined && active !== 'credits' && (
            <div className={`rounded-xl border border-line bg-surface-muted p-3.5 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Saldo</span>
              <span className="mt-1 block font-editorial text-[22px] font-semibold text-ink">{formatBRL(balance)}</span>
              <button
                type="button"
                onClick={() => select('credits')}
                className="mt-1 inline-flex min-h-10 items-center text-[13px] font-semibold text-accent hover:text-accent-strong"
              >
                Recarregar
              </button>
            </div>
          )}
          {account && (
            <div className={`flex items-center gap-2 px-1.5 ${collapsed ? 'lg:flex-col lg:px-0' : ''}`}>
              <span
                className={`min-w-0 flex-1 truncate text-xs text-muted ${collapsed ? 'lg:sr-only' : ''}`}
                title={account.user.displayName}
              >
                {account.user.displayName}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--fl-radius-control)] border border-line-control px-3 text-sm font-semibold text-ink-soft hover:bg-canvas-deep"
                aria-label="Sair da conta"
                title={collapsed ? 'Sair da conta' : undefined}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className={collapsed ? 'lg:sr-only' : ''}>Sair</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden min-h-11 w-full items-center justify-center gap-2 rounded-[var(--fl-radius-control)] text-xs font-medium text-subtle hover:bg-canvas-deep hover:text-ink lg:inline-flex"
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!collapsed}
            aria-controls="forgelex-sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                <span>Recolher</span>
              </>
            )}
          </button>
        </div>
        )}
      </aside>
    </>
  );
};
