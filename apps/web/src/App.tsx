import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import AuthScreen from './screens/AuthScreen';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Scale } from 'lucide-react';
import { parseBillingReturn } from './billing-return';

const LandingScreen = lazy(() => import('./screens/LandingScreen').then(({ LandingScreen: screen }) => ({ default: screen })));
const ResearchDeskScreen = lazy(() => import('./screens/ResearchDeskScreen').then(({ ResearchDeskScreen: screen }) => ({ default: screen })));
const MatterWorkspaceScreen = lazy(() => import('./screens/MatterWorkspaceScreen').then(({ MatterWorkspaceScreen: screen }) => ({ default: screen })));
const DraftStudioScreen = lazy(() => import('./screens/DraftStudioScreen').then(({ DraftStudioScreen: screen }) => ({ default: screen })));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen').then(({ DashboardScreen: screen }) => ({ default: screen })));
const ConnectionsScreen = lazy(() => import('./screens/ConnectionsScreen').then(({ ConnectionsScreen: screen }) => ({ default: screen })));
const CreditsScreen = lazy(() => import('./screens/CreditsScreen').then(({ CreditsScreen: screen }) => ({ default: screen })));
const AccountActivityScreen = lazy(() => import('./screens/AccountActivityScreen').then(({ AccountActivityScreen: screen }) => ({ default: screen })));
const AccountSecurityScreen = lazy(() => import('./screens/AccountSecurityScreen').then(({ AccountSecurityScreen: screen }) => ({ default: screen })));
const AccountClosureStatusScreen = lazy(() => import('./screens/AccountClosureStatusScreen').then(({ AccountClosureStatusScreen: screen }) => ({ default: screen })));
const ApiKeysScreen = lazy(() => import('./screens/ApiKeysScreen').then(({ ApiKeysScreen: screen }) => ({ default: screen })));
const ForLawyersGuideScreen = lazy(() => import('./screens/ForLawyersGuideScreen').then(({ ForLawyersGuideScreen: screen }) => ({ default: screen })));
const ApiDocsScreen = lazy(() => import('./screens/ApiDocsScreen').then(({ ApiDocsScreen: screen }) => ({ default: screen })));

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();
  const { status, passwordRecovery, passwordRecoveryError } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const billingReturn = React.useMemo(() => parseBillingReturn(window.location.search), []);

  React.useEffect(() => {
    if (billingReturn) setActiveTab('credits', 'replace');
  }, [billingReturn, setActiveTab]);

  if (passwordRecoveryError) {
    return <AuthScreen initialView="recovery_error" status="signed_out" />;
  }
  if (passwordRecovery) {
    return <AuthScreen initialView="reset_password" status="signed_out" />;
  }
  if (status !== 'authenticated' && status !== 'legacy') {
    return <AuthScreen initialView="sign_in" status={status} />;
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-[#FBF9F5]">
      {/* Header */}
      <Header menuOpen={sidebarOpen} onMenuToggle={() => setSidebarOpen((value) => !value)} />

      <div className="relative flex min-w-0 flex-1">
        <Sidebar activeTab={activeTab} mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} onSelect={setActiveTab} />
        <main className="min-w-0 flex-1">
          <Suspense fallback={<div className="page-container py-16 text-sm text-stone-500">Carregando espaço de trabalho…</div>}>
            {activeTab === 'landing' && <LandingScreen />}
            {activeTab === 'research' && <ResearchDeskScreen />}
            {activeTab === 'matter' && <MatterWorkspaceScreen />}
            {activeTab === 'draft_studio' && <DraftStudioScreen />}
            {activeTab === 'dashboard' && <DashboardScreen />}
            {activeTab === 'connections' && <ConnectionsScreen />}
            {activeTab === 'credits' && <CreditsScreen />}
            {activeTab === 'account_activity' && <AccountActivityScreen />}
            {activeTab === 'account_security' && <AccountSecurityScreen />}
            {activeTab === 'api_keys' && <ApiKeysScreen />}
            {activeTab === 'for_lawyers_guide' && <ForLawyersGuideScreen />}
            {activeTab === 'api_docs' && <ApiDocsScreen />}
          </Suspense>
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
  if (typeof window !== 'undefined' && window.location.pathname === '/conta/encerramento') {
    return <Suspense fallback={<div className="page-container py-16 text-sm text-stone-500">Carregando acompanhamento…</div>}><AccountClosureStatusScreen /></Suspense>;
  }
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
