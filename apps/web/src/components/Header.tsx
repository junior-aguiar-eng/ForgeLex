import React from 'react';
import { useApp } from '../context/AppContext';
import { Scale, Wallet, Cpu, LayoutDashboard, FileCode, Search, ShieldCheck, FileCheck2, FolderOpen } from 'lucide-react';

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, totalBalanceCents, approvals } = useApp();

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'PENDING').length;

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <header className="sticky top-0 z-50 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-champagne-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo Brand */}
          <div 
            onClick={() => setActiveTab('landing')}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cognac-600 to-cognac-800 flex items-center justify-center shadow-md shadow-cognac-900/15 group-hover:scale-105 transition-transform duration-200">
              <Scale className="w-6 h-6 text-[#FBF9F5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-editorial text-2xl font-bold tracking-tight text-stone-900">
                  FORGELEX
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-cognac-100 text-cognac-800 border border-cognac-200">
                  V2 AGNÓSTICA
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium hidden sm:block">
                Inteligência Agêntica com Rastreabilidade Forense
              </p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            <button
              onClick={() => setActiveTab('landing')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'landing'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Início</span>
            </button>

            <button
              onClick={() => setActiveTab('research')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'research'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Research Desk</span>
            </button>

            <button
              onClick={() => setActiveTab('matter')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'matter'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Casos</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 relative ${
                activeTab === 'dashboard'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
              {pendingApprovalsCount > 0 && (
                <span className="ml-1 w-5 h-5 text-xs bg-amber-600 text-white rounded-full flex items-center justify-center font-bold animate-pulse">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('connections')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'connections'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Conexões</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </button>

            <button
              onClick={() => setActiveTab('credits')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'credits'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Créditos</span>
            </button>

            <button
              onClick={() => setActiveTab('api_docs')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'api_docs'
                  ? 'bg-cognac-100/80 text-cognac-800 font-semibold'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/60'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>API & Docs</span>
            </button>
          </nav>

          {/* Right Action: Balance Pill & Access */}
          <div className="flex items-center space-x-3">
            {/* Live Wallet Badge */}
            <div 
              onClick={() => setActiveTab('credits')}
              className="champagne-card px-3.5 py-1.5 rounded-full flex items-center space-x-2 cursor-pointer hover:border-cognac-400 transition-colors shadow-sm"
              title="Saldo disponível para consultas e fluxos"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs text-stone-500 font-medium">Saldo:</span>
              <span className="text-sm font-bold text-cognac-800">
                {formatCurrency(totalBalanceCents)}
              </span>
            </div>

            {/* Main Action Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'landing' ? 'dashboard' : 'landing')}
              className="hidden sm:inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white text-sm font-medium shadow-md shadow-cognac-900/10 transition-all hover:shadow-lg active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{activeTab === 'landing' ? 'Acessar Painel' : 'Nova Pesquisa'}</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
