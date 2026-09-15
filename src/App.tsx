/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, Suspense, lazy } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';
import { MainLayout } from './components/layout/MainLayout';
import { useNavigationStore } from './store/useNavigationStore';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { DashboardPage } from './pages/DashboardPage';

// Code splitting / Lazy loading for non-critical views to optimize cold start & bundle parsing
const ServersPage = lazy(() =>
  import('./pages/ServersPage').then((module) => ({ default: module.ServersPage }))
);
const StatsPage = lazy(() =>
  import('./pages/StatsPage').then((module) => ({ default: module.StatsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))
);

export default function App() {
  // Activate Capacitor / Web lifecycle listeners for 2026 battery standard compliance
  useAppLifecycle();

  // Dismiss native splash screen immediately when React initial layout is fully mounted
  useEffect(() => {
    SplashScreen.hide().catch(() => {
      // In web preview or Electron, gracefully ignore if plugin is unavailable
    });
  }, []);

  const currentTab = useNavigationStore((state) => state.currentTab);

  const renderCurrentView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'servers':
        return <ServersPage />;
      case 'stats':
        return <StatsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="w-full min-h-[360px] flex items-center justify-center">
            <div
              style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
              className="w-7 h-7 rounded-full border-2 animate-spin"
            />
          </div>
        }
      >
        {renderCurrentView()}
      </Suspense>
    </MainLayout>
  );
}


