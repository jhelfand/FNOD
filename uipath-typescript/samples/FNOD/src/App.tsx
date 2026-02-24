import { useState } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/useAuth';
import CaseHeader from './components/layout/CaseHeader';
import { Navigation } from './components/layout/Navigation';
import { LoginScreen } from './components/screens/LoginScreen';
import SummaryScreen from './components/screens/SummaryScreen';
import SummaryCaseScreen from './components/screens/SummaryCaseScreen';
import { CaseProvider } from './contexts/CaseContext';
import PolicyReviewScreen from './components/screens/PolicyReviewScreen';
import BeneficiaryResearchScreen from './components/screens/BeneficiaryResearchScreen';
import PayoutCalculatorScreen from './components/screens/PayoutCalculatorScreen';
import DocValidationScreen from './components/screens/DocValidationScreen';
import CaseManagementScreen from './components/screens/CaseManagementScreen';
import { Dashboard } from './components/screens/Dashboard';
import { ConversationalAgent } from './components/shared/ConversationalAgent';
import type { UiPathSDKConfig } from '@uipath/uipath-typescript';

const authConfig: UiPathSDKConfig = {
  clientId: import.meta.env.VITE_UIPATH_CLIENT_ID || 'your-client-id',
  orgName: import.meta.env.VITE_UIPATH_ORG_NAME || 'your-organization',
  tenantName: import.meta.env.VITE_UIPATH_TENANT_NAME || 'your-tenant',
  baseUrl: import.meta.env.VITE_UIPATH_BASE_URL || 'https://staging.uipath.com',
  redirectUri: import.meta.env.VITE_UIPATH_REDIRECT_URI || window.location.origin,
  scope: import.meta.env.VITE_UIPATH_SCOPE || 'offline_access',
};

function AppContent() {
  const { isAuthenticated, isLoading, sdk } = useAuth();
  const [activeTab, setActiveTab] = useState('case-selector');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-600 font-medium">Initializing UiPath SDK...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'case-selector':
        return <SummaryCaseScreen onNavigate={setActiveTab} />;
      case 'beneficiaries':
        return <BeneficiaryResearchScreen onNavigate={setActiveTab} />;
      case 'payout':
        return <PayoutCalculatorScreen onNavigate={setActiveTab} />;
      case 'doc-validation':
        return <DocValidationScreen onNavigate={setActiveTab} />;
      case 'policy-review':
        return <PolicyReviewScreen onNavigate={setActiveTab} />;
      case 'maestro':
        return sdk ? <Dashboard sdk={sdk} /> : (
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-600">Loading SDK...</div>
          </div>
        );
      case 'summary':
      default:
        return null; // Summary uses grid layout below
    }
  };

  const isCaseManagementActive = activeTab === 'case-management';
  const isSummaryActive =
    activeTab === 'summary' ||
    !['case-selector', 'beneficiaries', 'payout', 'doc-validation', 'policy-review', 'maestro', 'case-management'].includes(activeTab);

  return (
    <div className="min-h-screen bg-gray-50">
      <CaseHeader />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="max-w-none mx-4 px-6 lg:px-8 py-8 relative">
        {/* Tab content - hide when Case Management is active */}
        <div style={{ display: isCaseManagementActive ? 'none' : 'block' }}>
          <div className="grid grid-cols-12 gap-6">
            {/* Main content - Summary uses 9 cols + agent slot, others use full 12 */}
            <div className={isSummaryActive ? 'col-span-12 lg:col-span-9' : 'col-span-12'}>
              {isSummaryActive ? (
                <SummaryScreen onNavigate={setActiveTab} includeAgent={false} />
              ) : (
                renderContent()
              )}
            </div>
            {/* Conversational Agent - always mounted to preload; visible when Summary active, hidden otherwise */}
            <div
              className={isSummaryActive ? 'col-span-12 lg:col-span-3 flex flex-col' : ''}
              style={
                !isSummaryActive
                  ? {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: 320,
                      minHeight: 500,
                      visibility: 'hidden',
                      pointerEvents: 'none',
                      zIndex: -1,
                    }
                  : undefined
              }
              aria-hidden={!isSummaryActive}
            >
              <div className="bg-white rounded-lg shadow p-4 flex-1">
                <div className="font-semibold mb-2">AI Assistant</div>
                <ConversationalAgent />
              </div>
            </div>
          </div>
        </div>
        {/* Case Management - always mounted to preload iframe in background, visible when tab is active */}
        <div
          style={{
            position: isCaseManagementActive ? 'relative' : 'absolute',
            top: 0,
            left: 0,
            right: 0,
            minHeight: isCaseManagementActive ? undefined : '600px',
            visibility: isCaseManagementActive ? 'visible' : 'hidden',
            pointerEvents: isCaseManagementActive ? 'auto' : 'none',
            zIndex: isCaseManagementActive ? 0 : -1,
          }}
          aria-hidden={!isCaseManagementActive}
        >
          <CaseManagementScreen />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider config={authConfig}>
      <CaseProvider>
        <AppContent />
      </CaseProvider>
    </AuthProvider>
  );
}

export default App;
