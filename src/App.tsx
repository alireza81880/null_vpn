/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { useNavigationStore } from './store/useNavigationStore';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { DashboardPage } from './pages/DashboardPage';
import { ServersPage } from './pages/ServersPage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  // Activate Capacitor / Web lifecycle listeners for 2026 battery standard compliance
  useAppLifecycle();

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
      {renderCurrentView()}
    </MainLayout>
  );
}

