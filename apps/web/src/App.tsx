import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { LandingScreen } from './screens/LandingScreen';
import { ResearchDeskScreen } from './screens/ResearchDeskScreen';
import { MatterWorkspaceScreen } from './screens/MatterWorkspaceScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ConnectionsScreen } from './screens/ConnectionsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { ApiDocsScreen } from './screens/ApiDocsScreen';
import { Scale, ShieldCheck, Lock } from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5]">
      {/* Header */}
      <Header />

      {/* Main Screen Content */}
      <main className="flex-1">
        {activeTab === 'landing' && <LandingScreen />}
        {activeTab === 'research' && <ResearchDeskScreen />}
        {activeTab === 'matter' && <MatterWorkspaceScreen />}
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'connections' && <ConnectionsScreen />}
        {activeTab === 'credits' && <CreditsScreen />}
        {activeTab === 'api_docs' && <ApiDocsScreen />}
      </main>

      {/* Footer Editorial */}
      <footer className="bg-white border-t border-champagne-border mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-cognac-700 flex items-center justify-center text-white">
                  <Scale className="w-4 h-4" />
                </div>
                <span className="font-editorial text-lg font-bold text-stone-900">
                  FORGELEX
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-cognac-100 text-cognac-800">
                  V2 Canônica
                </span>
              </div>
              <p className="text-xs text-stone-500 max-w-md leading-relaxed">
                Plataforma Agêntica Jurídica Agnóstica projetada para a advocacia de alta performance. 
                Raciocínio dedutivo auditável, ancoragem probatória em acórdãos oficiais e 
                governança Human-in-the-Loop em conformidade com o Código de Ética da OAB e LGPD.
              </p>
              <div className="flex items-center space-x-4 text-xs text-stone-400 pt-2">
                <span className="flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sigilo Criptográfico SHA-256</span>
                </span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-cognac-600" />
                  <span>Nível Forense L4 Guard</span>
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-stone-700">Navegação</h4>
              <ul className="space-y-1.5 text-stone-500">
                <li><button onClick={() => setActiveTab('research')} className="hover:text-cognac-800">Research Desk</button></li>
                <li><button onClick={() => setActiveTab('landing')} className="hover:text-cognac-800">Página inicial</button></li>
                <li><button onClick={() => setActiveTab('dashboard')} className="hover:text-cognac-800">Painel do Advogado</button></li>
                <li><button onClick={() => setActiveTab('connections')} className="hover:text-cognac-800">Modelos & Provedores</button></li>
                <li><button onClick={() => setActiveTab('credits')} className="hover:text-cognac-800">Créditos & Ledger</button></li>
                <li><button onClick={() => setActiveTab('api_docs')} className="hover:text-cognac-800">Documentação API</button></li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-stone-700">Conformidade & Suporte</h4>
              <ul className="space-y-1.5 text-stone-500">
                <li><span className="text-stone-600 font-medium">Tribunais Homologados:</span> STF, STJ, TST, TJSP, TJRJ, TRF3</li>
                <li><span className="text-stone-600 font-medium">Protocolo de Distribuição:</span> Model Context Protocol (MCP)</li>
                <li><span className="text-stone-600 font-medium">Segurança de Dados:</span> Criptografia em Trânsito e Repouso</li>
                <li className="pt-2 text-[11px] text-stone-400">© 2026 ForgeLex Tecnologia Ltda. Todos os direitos reservados.</li>
              </ul>
            </div>

          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
