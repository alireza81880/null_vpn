import React from 'react';
import { Shield, Languages, Wifi } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n/I18nContext';

interface WindowHeaderProps {
  title?: string;
}

export const WindowHeader: React.FC<WindowHeaderProps> = ({ title }) => {
  const connectionState = useAppStore((state) => state.connectionState);
  const { t, language, toggleLanguage } = useI18n();

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <header
      id="app-window-header"
      dir="ltr"
      className="h-14 px-4 sm:px-6 flex items-center justify-between border-b select-none window-drag-region z-20 shrink-0 text-left"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Mobile Title / Desktop View Title */}
      <div className="flex items-center gap-3 window-no-drag">
        <div className="lg:hidden flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shadow"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #312e81 100%)',
              color: 'var(--accent-foreground)',
            }}
          >
            <Shield className="w-4 h-4" />
          </div>
          <span
            className="text-sm font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('common.appName')}
          </span>
        </div>

        {title && (
          <h2
            className="text-sm font-semibold tracking-tight hidden lg:block"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h2>
        )}
      </div>

      {/* Right Utility Badges & Controls */}
      <div className="flex items-center gap-2.5 window-no-drag">
        {/* Dynamic Connection Status Badge */}
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: isConnected
              ? 'var(--status-connected)'
              : isConnecting
              ? 'var(--status-connecting)'
              : 'var(--status-disconnected)',
          }}
        >
          <span
            className={`w-2 h-2 rounded-full transition-all ${
              isConnected || isConnecting ? 'animate-pulse' : ''
            }`}
            style={{
              backgroundColor: isConnected
                ? 'var(--status-connected)'
                : isConnecting
                ? 'var(--status-connecting)'
                : 'var(--status-disconnected)',
              boxShadow: isConnected
                ? '0 0 8px var(--status-connected-glow)'
                : isConnecting
                ? '0 0 8px var(--status-connecting-glow)'
                : 'none',
            }}
          />
          <span className="text-[11px] font-semibold tracking-wide">
            {isConnected
              ? t('dashboard.protected')
              : isConnecting
              ? t('dashboard.connecting')
              : t('dashboard.unprotected')}
          </span>
          <Wifi className="w-3 h-3 opacity-60 ms-0.5" />
        </div>

        {/* Language Switcher Button */}
        <button
          type="button"
          id="btn-header-lang"
          onClick={toggleLanguage}
          className="px-2.5 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all hover:opacity-85 flex items-center gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <Languages className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-sans">{language === 'en' ? 'FA' : 'EN'}</span>
        </button>
      </div>
    </header>
  );
};
