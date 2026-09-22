import React, { useEffect, useState } from 'react';
import { Cable, FileCode2, LayoutDashboard, PanelLeftClose, PanelLeftOpen, WalletCards, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppTab } from '../navigation/routes';

const secondaryNavigation: Array<{ tab: AppTab; label: string; icon: LucideIcon }> = [
  { tab: 'landing', label: 'Visão geral', icon: LayoutDashboard },
  { tab: 'credits', label: 'Conta e faturamento', icon: WalletCards },
  { tab: 'connections', label: 'Conectar IA', icon: Cable },
  { tab: 'api_docs', label: 'Documentação da API', icon: FileCode2 },
];

export const Sidebar: React.FC<{
  activeTab: AppTab;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelect: (tab: AppTab) => void;
}> = ({ activeTab, mobileOpen, onCloseMobile, onSelect }) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu lateral"
        onClick={onCloseMobile}
        className={`fixed inset-0 z-40 bg-stone-950/20 lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}
      />
      <aside
        id="forgelex-sidebar"
        aria-label="Navegação secundária"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-champagne-border bg-[#FBF9F5] pt-16 shadow-xl transition-transform duration-200 lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:pt-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <div className="flex min-h-16 items-center justify-between border-b border-stone-200/70 px-4">
          {!collapsed && <span className="eyebrow">Espaço de trabalho</span>}
          <button type="button" onClick={onCloseMobile} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden" aria-label="Fechar menu lateral"><X className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="hidden rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:block" aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!collapsed} aria-controls="forgelex-sidebar">{collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}</button>
        </div>
        <nav className="space-y-1 p-3" aria-label="Conta e recursos técnicos">
          {secondaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = item.tab === activeTab;
            return <button key={item.tab} type="button" onClick={() => { onSelect(item.tab); onCloseMobile(); }} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${active ? 'bg-cognac-100 text-cognac-900' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span></button>;
          })}
        </nav>
        {!collapsed && <div className="mt-auto border-t border-stone-200/70 p-4 text-xs leading-relaxed text-stone-500">As áreas de conta e integração ficam separadas do trabalho jurídico.</div>}
      </aside>
    </>
  );
};
