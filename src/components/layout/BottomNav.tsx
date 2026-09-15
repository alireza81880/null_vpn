import React from 'react';
import { Home, Layers, BarChart3, Settings } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useI18n } from '../../i18n/I18nContext';
import type { NavTab } from '../../types/navigation';

/**
 * BottomNav (Telegram-Style Floating Glassmorphic Navigation)
 * 
 * Features:
 * - Floating, elevated bar (`bottom-4 left-0 right-0 max-w-sm mx-auto`).
 * - Translucent glassmorphism (`bg-white/10 backdrop-blur-md border border-white/15`).
 * - Separate floating circular buttons (`rounded-full`) for each navigation tab.
 * - Tactile active feedback with subtle glow and spring scaling.
 */
export const BottomNav: React.FC = () => {
  const currentTab = useNavigationStore((state) => state.currentTab);
  const setCurrentTab = useNavigationStore((state) => state.setCurrentTab);
  const { t } = useI18n();

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: Home },
    { id: 'servers', label: t('nav.tunnels'), icon: Layers },
    { id: 'stats', label: t('nav.stats'), icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <nav
      id="sticky-mobile-bottom-nav"
      aria-label="Mobile Navigation"
      dir="ltr"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
        bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
      className="lg:hidden fixed inset-x-0 z-40 px-4 pointer-events-none flex justify-center"
    >
      <div
        dir="ltr"
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
        }}
        className="pointer-events-auto flex items-center justify-center gap-3 px-3.5 py-2.5 rounded-full bg-white/10 dark:bg-white/10 backdrop-blur-md border border-white/20 dark:border-white/15"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              id={`bottom-nav-${item.id}`}
              type="button"
              onClick={() => setCurrentTab(item.id as NavTab)}
              aria-label={item.label}
              className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 cursor-pointer active:scale-90 ${
                isActive
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40 ring-2 ring-white/30 scale-105'
                  : 'bg-black/20 hover:bg-white/15 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
              />

              {/* Tiny indicator dot under active tab */}
              {isActive && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
