import React, { memo } from 'react';
import { motion } from 'motion/react';
import { Power, ShieldCheck, RefreshCw, X } from 'lucide-react';
import type { ConnectionState } from '../../types/vpn';
import { useI18n } from '../../i18n/I18nContext';

export interface MainConnectButtonProps {
  id?: string;
  connectionState: ConnectionState;
  isConnecting: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * MainConnectButton (Compact Soft-Neumorphic Pill with Integrated Circular Control)
 * 
 * Target Spec:
 * - Wide horizontal pill (rounded-full / border-radius: 9999px)
 * - Compact vertical height (h-[58px] sm:h-[64px])
 * - Dark/soft neumorphic surface matching the theme & bottom navigation
 * - Subtle inner highlight & soft outer shadow
 * - Connection icon inside a SMALL circular control (48–56px diameter)
 * - Proportional, vertically centered, and NEVER an oversized white circle
 * - Disconnected: dark neumorphic pill, small neutral circular icon container, no aggressive glow
 * - Connected: same dimensions, accent-colored circular icon container, calm & premium
 * - Connecting: active CANCEL action, subtle pulse/spin on icon, same dimensions
 * - Active/Pressed: translateY(2–3px), slightly reduced elevation
 * - Hover: subtle highlight, small elevation increase
 */
export const MainConnectButton: React.FC<MainConnectButtonProps> = memo(({
  id = 'btn-main-connection-toggle',
  connectionState,
  isConnecting,
  disabled = false,
  onClick,
  className = '',
}) => {
  const { t } = useI18n();

  const isConnected = connectionState === 'connected';
  // While connecting, button is NOT disabled - it acts as an immediate CANCEL action
  const isButtonDisabled = disabled && !isConnecting;

  return (
    <div className={`w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center ${className}`}>
      <motion.button
        id={id}
        type="button"
        role="button"
        aria-label={
          isConnecting
            ? (t('common.cancel') || 'Cancel connection attempt')
            : isConnected
            ? t('dashboard.disconnect')
            : t('dashboard.connect')
        }
        aria-pressed={isConnected}
        disabled={isButtonDisabled}
        onClick={onClick}
        whileHover={!isButtonDisabled ? { y: -1 } : undefined}
        whileTap={!isButtonDisabled ? { y: 2, scale: 0.985 } : undefined}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform',
          backgroundColor: 'var(--bg-surface)',
          borderColor: isConnecting ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)',
          boxShadow: isConnected
            ? 'var(--neo-raised-lg), 0 0 16px var(--status-connected-glow)'
            : isConnecting
            ? 'var(--neo-raised-lg), 0 0 14px rgba(239, 68, 68, 0.25)'
            : 'var(--neo-raised-lg)',
        }}
        className={`
          group relative w-full h-[58px] sm:h-[64px] rounded-full px-2 sm:px-2.5
          flex items-center justify-between border select-none
          outline-none cursor-pointer transition-all duration-200
          ${isButtonDisabled ? 'cursor-not-allowed opacity-60' : 'hover:brightness-105 active:shadow-[var(--neo-pressed)]'}
        `}
      >
        {/* Optical Spacer Left (matches icon container size to keep center text centered) */}
        <div className="w-10 sm:w-12 shrink-0 pointer-events-none" aria-hidden="true" />

        {/* Center Typography: CONNECT / DISCONNECT / CANCEL */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0">
          <span
            style={{
              color: isConnected
                ? 'var(--status-connected)'
                : isConnecting
                ? '#ef4444'
                : 'var(--text-primary)',
            }}
            className="text-xs sm:text-sm font-bold tracking-widest uppercase truncate font-mono"
          >
            {isConnecting
              ? (t('common.cancel') || 'CANCEL')
              : isConnected
              ? t('dashboard.disconnect')
              : t('dashboard.connect')}
          </span>

          <span
            style={{ color: isConnecting ? '#f87171' : 'var(--text-muted)' }}
            className="text-[10px] font-mono tracking-tight truncate hidden sm:inline-block"
          >
            {isConnected
              ? t('dashboard.protected')
              : isConnecting
              ? 'Tap to cancel'
              : t('dashboard.tapToToggle')}
          </span>
        </div>

        {/* Small Integrated Circular Icon Container (48px / 52px on mobile) */}
        <div
          style={{
            transform: 'translateZ(0)',
            backgroundColor: isConnected
              ? 'var(--accent-primary)'
              : isConnecting
              ? 'rgba(239, 68, 68, 0.15)'
              : 'var(--bg-surface-elevated)',
            borderColor: isConnected
              ? 'var(--accent-primary)'
              : isConnecting
              ? 'rgba(239, 68, 68, 0.5)'
              : 'var(--border-subtle)',
            color: isConnected
              ? 'var(--accent-foreground, #ffffff)'
              : isConnecting
              ? '#ef4444'
              : 'var(--text-secondary)',
            boxShadow: isConnected
              ? 'var(--neo-raised-sm), 0 0 14px var(--accent-glow)'
              : isConnecting
              ? 'var(--neo-raised-sm), 0 0 10px rgba(239, 68, 68, 0.3)'
              : 'var(--neo-raised-sm)',
          }}
          className={`
            relative shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full
            flex items-center justify-center border transition-all duration-200
            group-hover:scale-[1.03] group-active:scale-95 group-active:shadow-[var(--neo-pressed)]
          `}
        >
          {isConnecting ? (
            <div className="relative flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none"
              >
                <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
              </motion.div>
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 stroke-[2.5]" />
            </div>
          ) : isConnected ? (
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
          ) : (
            <Power className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
          )}

          {/* Micro status indicator dot */}
          {isConnected && (
            <span
              style={{ backgroundColor: 'var(--accent-foreground, #ffffff)' }}
              className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full shadow-xs"
              aria-hidden="true"
            />
          )}
        </div>
      </motion.button>

      {/* Subtext info */}
      <p
        style={{ color: 'var(--text-muted)' }}
        className="text-[11px] font-mono mt-2 text-center"
      >
        {t('dashboard.tapToToggle')}
      </p>
    </div>
  );
});

MainConnectButton.displayName = 'MainConnectButton';
