import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { WindowHeader } from './WindowHeader';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useI18n } from '../../i18n/I18nContext';

export interface MainLayoutProps {
  children?: ReactNode;
}

/**
 * MainLayout
 * 
 * Adaptive layout shell optimized for Electron (Desktop) and Capacitor (Mobile).
 * - Desktop (>= 1024px / lg): Left-docked vertical Sidebar + top titlebar drag area.
 * - Mobile (<= 768px / md): Bottom Navigation Bar + responsive top app bar.
 * - RTL/LTR: Fully adaptive direction via `dir` on HTML root.
 * - Design Tokens: Styled exclusively via CSS variables for the 12 active themes.
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const currentTab = useNavigationStore((state) => state.currentTab);
  const { t } = useI18n();

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return t('nav.dashboard');
      case 'servers':
        return t('nav.tunnels');
      case 'stats':
        return t('nav.stats');
      case 'settings':
        return t('nav.settings');
      default:
        return t('nav.dashboard');
    }
  };

  return (
    <div
      id="vpn-app-root"
      className="flex h-screen w-full overflow-hidden select-none transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        backgroundImage: 'var(--bg-canvas-gradient)',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. Desktop Vertical Sidebar (visible on lg screens and up) */}
      <Sidebar />

      {/* 2. Main Application Flow */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Top Header / Electron Titlebar */}
        <WindowHeader title={getTabTitle()} />

        {/* Flexible Main Content Area */}
        <main
          id="main-viewport"
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 pb-36 sm:pb-36 lg:pb-12 transition-all flex flex-col justify-between"
          style={{
            color: 'var(--text-primary)',
            paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="max-w-5xl mx-auto w-full flex-1">
            {children}
          </div>

          {/* Footer Attribution */}
          <footer
            id="app-footer-attribution"
            dir="ltr"
            className="w-full text-center py-5 mt-6 select-text flex items-center justify-center gap-1.5"
          >
            <span className="text-sm font-light text-gray-500 tracking-wide">
              Made by
            </span>
            <a
              href="https://alireza81880.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 hover:scale-105 hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.5)] transition-all duration-300 inline-block cursor-pointer"
            >
              null
            </a>
          </footer>
        </main>

        {/* 3. Mobile Bottom Navigation Bar (visible on md screens and down) */}
        <BottomNav />
      </div>
    </div>
  );
};
