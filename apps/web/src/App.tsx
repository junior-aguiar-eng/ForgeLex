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
import { DraftStudioScreen } from './screens/DraftStudioScreen';
import { FileCode2, Scale, Settings2, WalletCards } from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-[#FBF9F5]">
      {/* Header */}
      <Header />

      {/* Main Screen Content */}
      <main className="min-w-0 flex-1">
        {activeTab === 'landing' && <LandingScreen />}
        {activeTab === 'research' && <ResearchDeskScreen />}
        {activeTab === 'matter' && <MatterWorkspaceScreen />}
        {activeTab === 'draft_studio' && <DraftStudioScreen />}
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'connections' && <ConnectionsScreen />}
        {activeTab === 'credits' && <CreditsScreen />}
        {activeTab === 'api_docs' && <ApiDocsScreen />}
      </main>

      <footer className="mt-12 border-t border-stone-200/80 bg-white/55">
        <div className="page-container flex flex-col gap-3 py-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-cognac-700" aria-hidden="true" />
            <span className="font-editorial font-bold text-stone-800">ForgeLex</span>
            <span>· espaço de trabalho jurídico</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Recursos secundários">
            <button type="button" onClick={() => setActiveTab('connections')} className="inline-flex items-center gap-1.5 hover:text-cognac-800"><Settings2 className="h-3.5 w-3.5" aria-hidden="true" />Configurações</button>
            <button type="button" onClick={() => setActiveTab('credits')} className="inline-flex items-center gap-1.5 hover:text-cognac-800"><WalletCards className="h-3.5 w-3.5" aria-hidden="true" />Créditos</button>
            <button type="button" onClick={() => setActiveTab('api_docs')} className="inline-flex items-center gap-1.5 hover:text-cognac-800"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />Área técnica</button>
            <span>© 2026</span>
          </nav>
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
