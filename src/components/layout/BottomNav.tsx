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
          backgroundColor: 'var(--bg-surface-glass)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--neo-raised-lg)',
        }}
        className="glass-nav pointer-events-auto flex items-center justify-center gap-3 px-3.5 py-2.5 rounded-full border"
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
              style={{
                backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                color: isActive ? 'var(--accent-foreground, #ffffff)' : 'var(--text-secondary)',
                boxShadow: isActive ? 'var(--neo-raised-sm), 0 0 16px var(--accent-glow)' : 'var(--neo-inset-sm)',
                borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
              }}
              className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 cursor-pointer active:scale-95 border ${
                isActive ? 'scale-105 font-bold' : 'hover:scale-100'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
              />

              {/* Tiny indicator dot under active tab */}
              {isActive && (
                <span
                  style={{ backgroundColor: 'var(--accent-foreground, #ffffff)' }}
                  className="absolute -bottom-1 w-1.5 h-1.5 rounded-full shadow-xs"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
