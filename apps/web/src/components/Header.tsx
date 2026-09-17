import React from 'react';
import { useApp } from '../context/AppContext';
import { FileCode2, FileText, FolderOpen, LogOut, Menu, Scale, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export type AppTab = 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs';

const primaryNavigation: Array<{ tab: AppTab; label: string; icon: LucideIcon }> = [
  { tab: 'matter', label: 'Casos', icon: FolderOpen },
  { tab: 'research', label: 'Pesquisa', icon: Search },
  { tab: 'draft_studio', label: 'Rascunhos', icon: FileText },
  { tab: 'dashboard', label: 'Revisão', icon: FileCode2 },
];

const NavigationButton: React.FC<{
  item: { tab: AppTab; label: string; icon: LucideIcon };
  active: boolean;
  onSelect: (tab: AppTab) => void;
  mobile?: boolean;
}> = ({ item, active, onSelect, mobile = false }) => {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.tab)}
      className={`${mobile ? 'w-full justify-start px-3' : 'px-3'} inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-cognac-100 text-cognac-800 font-semibold'
          : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
};

export const Header: React.FC<{ menuOpen: boolean; onMenuToggle: () => void }> = ({ menuOpen, onMenuToggle }) => {
  const { activeTab, setActiveTab } = useApp();
  const { account, signOut } = useAuth();

  const selectTab = (tab: AppTab) => {
    setActiveTab(tab);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-champagne-border bg-[#FBF9F5]/95 backdrop-blur-md">
      <div className="page-container">
        <div className="flex min-h-16 items-center gap-3 py-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => selectTab('landing')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') selectTab('landing');
            }}
            className="group flex min-w-0 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg pr-2"
            aria-label="ForgeLex, ir para o início"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cognac-700 text-[#FBF9F5] transition-transform duration-200 group-hover:scale-105">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="font-editorial truncate text-xl font-bold tracking-tight text-stone-900">ForgeLex</span>
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Navegação principal">
            {primaryNavigation.map((item) => (
              <NavigationButton key={item.tab} item={item} active={item.tab === activeTab} onSelect={selectTab} />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => selectTab('research')}
              className="hidden min-h-10 items-center gap-2 rounded-lg bg-cognac-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-cognac-800 xl:inline-flex"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Pesquisar</span>
            </button>

            <button
              type="button"
              onClick={onMenuToggle}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-champagne-border bg-white/70 px-3 text-sm font-semibold text-stone-700 hover:border-cognac-400 hover:bg-white lg:hidden"
              aria-label={menuOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'}
              aria-expanded={menuOpen}
              aria-controls="forgelex-sidebar"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </button>
            {account && <div className="hidden items-center gap-2 xl:flex">
              <span className="max-w-40 truncate text-sm text-stone-600" title={account.user.displayName}>{account.user.displayName}</span>
              <button type="button" onClick={() => void signOut()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-champagne-border bg-white/70 px-3 text-sm font-semibold text-stone-700 hover:border-cognac-400 hover:bg-white" aria-label="Sair da conta">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sair</span>
              </button>
            </div>}
          </div>
        </div>
      </div>
    </header>
  );
};
