import React from 'react';
import { Shield, Languages, Moon, Sun, Home, Layers, BarChart3, Settings } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n/I18nContext';
import type { NavTab } from '../../types/navigation';

export const Sidebar: React.FC = () => {
  const currentTab = useNavigationStore((state) => state.currentTab);
  const setCurrentTab = useNavigationStore((state) => state.setCurrentTab);

  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  const { t, language, toggleLanguage } = useI18n();

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: Home, shortcut: '⌘1' },
    { id: 'servers', label: t('nav.tunnels'), icon: Layers, shortcut: '⌘2' },
    { id: 'stats', label: t('nav.stats'), icon: BarChart3, shortcut: '⌘3' },
    { id: 'settings', label: t('nav.settings'), icon: Settings, shortcut: '⌘4' },
  ];

  const handleToggleThemeQuick = () => {
    // Quick toggle between primary dark and light
    setTheme(theme === 'deep-space' ? 'clean-minimal' : 'deep-space');
  };

  return (
    <aside
      className="hidden lg:flex flex-col w-64 h-screen select-none border-e glass-panel transition-all duration-200 z-30 shrink-0"
      style={{
        borderColor: 'var(--border-subtle)',
      }}
      aria-label="Desktop Navigation"
    >
      {/* Brand Header & Window Draggable Area */}
      <div
        className="h-16 px-5 flex items-center justify-between border-b window-drag-region"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3 window-no-drag">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #312e81 100%)',
              color: 'var(--accent-foreground)',
              boxShadow: '0 0 16px var(--accent-glow)',
            }}
          >
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1
              className="text-sm font-bold tracking-tight leading-none"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('common.appName')}
            </h1>
            <span
              className="text-[10px] font-mono tracking-wider opacity-75 mt-1 block"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('common.wireguardSecure')}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              type="button"
              onClick={() => setCurrentTab(item.id as NavTab)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group relative cursor-pointer"
              style={{
                backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent',
                boxShadow: isActive ? 'var(--glass-shadow)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                    color: isActive ? 'var(--accent-foreground)' : 'currentColor',
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="truncate">{item.label}</span>
              </div>

              <span
                className="text-[10px] font-mono opacity-50 px-1.5 py-0.5 rounded border border-transparent group-hover:border-current transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {item.shortcut}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Global Controls (Language & Theme Quick Switch) */}
      <div
        className="p-3.5 border-t flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Language Toggle Button */}
        <button
          type="button"
          id="btn-sidebar-lang"
          onClick={toggleLanguage}
          title={language === 'en' ? 'تغییر زبان به فارسی' : 'Switch language to English'}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold glass-interactive border cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <Languages className="w-4 h-4 text-teal-400" />
          <span className="truncate font-sans">
            {language === 'en' ? 'FA (فارسی)' : 'EN (English)'}
          </span>
        </button>

        {/* Theme Quick Toggle Button */}
        <button
          type="button"
          id="btn-sidebar-theme-quick"
          onClick={handleToggleThemeQuick}
          title="Quick Theme Toggle"
          className="p-2 rounded-xl glass-interactive border cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {theme.startsWith('clean') || theme.startsWith('soft') || theme.startsWith('pearl') || theme.startsWith('morning') ? (
            <Moon className="w-4 h-4 text-indigo-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </button>
      </div>
    </aside>
  );
};
