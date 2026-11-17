import React, { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Cable,
  Compass,
  FileCode2,
  FileText,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { CASE_WORKSPACE_ENABLED, DESK_ENABLED } from '../../config/site-capabilities';
import { highlightedTab, iceNavigation, type NavIcon, type NavItem } from '../../navigation/app-navigation';
import type { AppTab } from '../../navigation/routes';

/**
 * Lateral da casca do tema gelo (V2, tabela 7.2): Mesa, Casos e Jurisprudência no alto, recursos no meio e a conta no
 * rodapé. Na Mesa ela nasce recolhida em um trilho de ícones, para não tomar espaço das três áreas; o cliente pode
 * expandi-la e a escolha vale até a página recarregar. Abaixo de `lg` vira gaveta.
 */

const ICONS: Record<NavIcon, LucideIcon> = {
  desk: FileText,
  cases: FolderOpen,
  research: BookOpen,
  overview: LayoutDashboard,
  progress: Search,
  connections: Cable,
  guide: Compass,
  api: FileCode2,
  billing: WalletCards,
  activity: Activity,
  security: ShieldCheck,
  keys: KeyRound,
};

const MENU_TOGGLE = 'forgelex-menu-toggle';

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
      className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--fl-radius-control)] px-3 text-left text-sm font-medium transition-colors ${
        active ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft hover:bg-surface-muted hover:text-ink'
      } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={collapsed ? 'lg:sr-only' : ''}>{item.label}</span>
    </button>
  );
};

const Group: React.FC<{
  label: string;
  items: NavItem[];
  active: AppTab;
  collapsed: boolean;
  onSelect: (tab: AppTab) => void;
}> = ({ label, items, active, collapsed, onSelect }) => (
  <nav aria-label={label} className="space-y-1">
    {items.map((item) => (
      <ItemButton key={item.tab} item={item} active={item.tab === active} collapsed={collapsed} onSelect={onSelect} />
    ))}
  </nav>
);

export const IceSidebar: React.FC<{
  activeTab: AppTab;
  /** Recolhida por padrão (na Mesa). A escolha do cliente prevalece. */
  collapsedByDefault: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (tab: AppTab) => void;
}> = ({ activeTab, collapsedByDefault, mobileOpen, onCloseMobile, onSelect }) => {
  const { account, signOut } = useAuth();
  const [preference, setPreference] = useState<boolean | undefined>(undefined);
  const collapsed = preference ?? collapsedByDefault;
  const navigation = React.useMemo(
    () => iceNavigation({ deskEnabled: DESK_ENABLED, casesEnabled: CASE_WORKSPACE_ENABLED }),
    [],
  );
  const active = highlightedTab(activeTab);

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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface pt-16 shadow-xl transition-transform duration-200 lg:visible lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:pt-0 lg:shadow-none ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <div className="flex min-h-14 shrink-0 items-center justify-end px-3">
          <button
            type="button"
            onClick={onCloseMobile}
            className="min-h-11 min-w-11 rounded-[var(--fl-radius-control)] p-2 text-muted hover:bg-surface-muted lg:hidden"
            aria-label="Fechar menu lateral"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPreference(!collapsed)}
            className="hidden min-h-11 min-w-11 items-center justify-center rounded-[var(--fl-radius-control)] p-2 text-muted hover:bg-surface-muted lg:inline-flex"
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!collapsed}
            aria-controls="forgelex-sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          <Group
            label="Navegação principal"
            items={navigation.work}
            active={active}
            collapsed={collapsed}
            onSelect={select}
          />
          <div className="border-t border-line pt-4">
            <p className={`eyebrow mb-2 px-3 ${collapsed ? 'lg:sr-only' : ''}`}>Recursos</p>
            <Group
              label="Recursos"
              items={navigation.resources}
              active={active}
              collapsed={collapsed}
              onSelect={select}
            />
          </div>
        </div>

        <div className="shrink-0 space-y-1 border-t border-line p-3">
          <p className={`eyebrow mb-2 px-3 ${collapsed ? 'lg:sr-only' : ''}`}>Conta</p>
          <Group label="Conta" items={navigation.account} active={active} collapsed={collapsed} onSelect={select} />
          {account && (
            <div className={`flex items-center gap-2 px-3 pt-2 ${collapsed ? 'lg:flex-col lg:px-0' : ''}`}>
              <span
                className={`min-w-0 flex-1 truncate text-xs text-muted ${collapsed ? 'lg:sr-only' : ''}`}
                title={account.user.displayName}
              >
                {account.user.displayName}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--fl-radius-control)] border border-line-control px-3 text-sm font-semibold text-ink-soft hover:bg-surface-muted"
                aria-label="Sair da conta"
                title={collapsed ? 'Sair da conta' : undefined}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className={collapsed ? 'lg:sr-only' : ''}>Sair</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
