import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LandingScreen } from './screens/LandingScreen';
import { ResearchDeskScreen } from './screens/ResearchDeskScreen';
import { MatterWorkspaceScreen } from './screens/MatterWorkspaceScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ConnectionsScreen } from './screens/ConnectionsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { ApiDocsScreen } from './screens/ApiDocsScreen';
import { DraftStudioScreen } from './screens/DraftStudioScreen';
import AuthScreen from './screens/AuthScreen';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Scale } from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();
  const { status, passwordRecovery } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  if (status !== 'authenticated' && status !== 'legacy') {
    return <AuthScreen initialView={passwordRecovery ? 'reset_password' : 'sign_in'} status={status} />;
  }
  if (passwordRecovery) {
    return <AuthScreen initialView="reset_password" status={status} />;
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-[#FBF9F5]">
      {/* Header */}
      <Header menuOpen={sidebarOpen} onMenuToggle={() => setSidebarOpen((value) => !value)} />

      <div className="relative flex min-w-0 flex-1">
        <Sidebar activeTab={activeTab} mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} onSelect={setActiveTab} />
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
      </div>

      <footer className="mt-12 border-t border-stone-200/80 bg-white/55">
        <div className="page-container flex flex-col gap-3 py-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-cognac-700" aria-hidden="true" />
            <span className="font-editorial font-bold text-stone-800">ForgeLex</span>
            <span>· espaço de trabalho jurídico</span>
          </div>
          <span>© 2026 · informação institucional</span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
