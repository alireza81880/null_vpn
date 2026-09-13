import React from 'react';
import { Home, Layers, BarChart3, Settings } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useI18n } from '../../i18n/I18nContext';
import type { NavTab } from '../../types/navigation';

/**
 * BottomNav (Liquid Glass 2.0 Sticky Mobile Navigation Bar)
 * 
 * Performance & Architecture:
 * - Fixed firmly to bottom viewport (`fixed bottom-0 left-0 w-full z-50`).
 * - High-density frosted glass (iOS Control Center style blur(24px) + color-mix(85% surface)).
 * - Luminous 1px top border and gradient separator preventing content bleed-through.
 * - Dynamic theme adaptation across all 12 themes via CSS variables.
 * - Hardware compositing with `translateZ(0)`.
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
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        background: 'color-mix(in srgb, var(--bg-surface) 86%, transparent)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderColor: 'var(--border-glass)',
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.18), 0 -12px 36px 0 var(--glass-shadow)',
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
      }}
      className="lg:hidden fixed bottom-0 left-0 w-full z-50 border-t transition-colors duration-200"
      aria-label="Mobile Navigation"
    >
      {/* Luminous Top Gradient Accent Line */}
      <div
        className="absolute top-0 inset-x-0 h-[1.5px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--border-glass), var(--accent-primary), var(--border-glass), transparent)',
          opacity: 0.9,
        }}
      />

      <div className="flex items-center justify-around h-16 px-3 max-w-lg mx-auto relative">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              id={`bottom-nav-${item.id}`}
              type="button"
              onClick={() => setCurrentTab(item.id as NavTab)}
              className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all relative cursor-pointer group active:scale-95"
              style={{
                color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {/* Active Indicator Background Pill */}
              <div
                className="w-10 h-7 rounded-xl flex items-center justify-center transition-all mb-1"
                style={{
                  backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                  border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent',
                  boxShadow: isActive ? '0 2px 10px var(--glass-shadow)' : 'none',
                }}
              >
                <Icon
                  className="w-4 h-4 transition-transform"
                  style={{
                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                />
              </div>

              <span
                className="text-[10px] font-semibold tracking-tight truncate max-w-full"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {item.label}
              </span>

              {/* Top Accent Dot on Active Tab */}
              {isActive && (
                <span
                  className="absolute top-1 w-1 h-1 rounded-full animate-in fade-in zoom-in"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
