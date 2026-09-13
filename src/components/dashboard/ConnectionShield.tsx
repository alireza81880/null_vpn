import React, { memo, useCallback } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, ShieldCheck, Power, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n/I18nContext';

export interface ConnectionShieldProps {
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * ConnectionShield (Zero Layout Shift & GPU Hardware Accelerated)
 * 
 * Performance Directives:
 * - Subscribes strictly to primitive `connectionState` and `isAppActive` selectors.
 * - Animates ONLY `transform` (scale, rotate) and `opacity` via Framer Motion.
 * - Hardware layer compositing with `translateZ(0)` and `willChange: 'transform, opacity'`.
 * - Replaces GPU-melting dynamic box-shadow recalculations with GPU-composited opacity halos.
 * - Suspends continuous rotation / pulse loops when app is backgrounded (`isAppActive === false`).
 */
export const ConnectionShield: React.FC<ConnectionShieldProps> = memo(({ onToggle, disabled }) => {
  const connectionState = useAppStore((state) => state.connectionState);
  const isAppActive = useAppStore((state) => state.isAppActive);
  const { t } = useI18n();

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  // Stable handler preventing reference invalidation
  const handleShieldClick = useCallback(() => {
    if (!disabled && !isConnecting) {
      onToggle();
    }
  }, [disabled, isConnecting, onToggle]);

  return (
    <div
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
      className="relative flex flex-col items-center justify-center my-6 select-none"
    >
      {/* ====================================================================
          GPU COMPOSITED AMBIENT HALO LAYERS (Zero layout-triggering box-shadow)
          ==================================================================== */}
      
      {/* 1. Connected Ambient Pulse Ring (Transform scale & Opacity ONLY) */}
      {isConnected && (
        <motion.div
          animate={
            isAppActive
              ? { scale: [1, 1.15, 1], opacity: [0.35, 0.65, 0.35] }
              : { scale: 1, opacity: 0.35 }
          }
          transition={{
            duration: 3.2,
            repeat: isAppActive ? Infinity : 0,
            ease: 'easeInOut',
          }}
          style={{
            transform: 'translateZ(0)',
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            background: 'radial-gradient(circle, var(--status-connected-glow) 0%, transparent 70%)',
          }}
          className="absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* 2. Connecting Radar Spinner (Transform Rotate ONLY) */}
      {isConnecting && (
        <motion.div
          animate={isAppActive ? { rotate: 360 } : { rotate: 0 }}
          transition={{
            duration: 2.2,
            repeat: isAppActive ? Infinity : 0,
            ease: 'linear',
          }}
          style={{
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            borderColor: 'var(--status-connecting)',
          }}
          className="absolute w-56 h-56 sm:w-64 sm:h-64 rounded-full pointer-events-none border-2 border-dashed opacity-60"
          aria-hidden="true"
        />
      )}

      {/* ====================================================================
          MAIN INTERACTIVE SHIELD BUTTON
          Animates exclusively via GPU `transform: scale(...)` without layout shift
          ==================================================================== */}
      <motion.button
        id="btn-connection-shield"
        type="button"
        disabled={disabled || isConnecting}
        onClick={handleShieldClick}
        whileHover={!disabled && !isConnecting ? { scale: 1.03 } : undefined}
        whileTap={!disabled && !isConnecting ? { scale: 0.96 } : undefined}
        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
        aria-label={isConnected ? t('dashboard.disconnect') : t('dashboard.connect')}
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          background: isConnected
            ? 'linear-gradient(145deg, var(--bg-surface-elevated), var(--bg-surface))'
            : isConnecting
            ? 'linear-gradient(145deg, var(--bg-surface-elevated), var(--bg-surface))'
            : 'linear-gradient(145deg, var(--bg-surface-glass), var(--bg-surface))',
          borderColor: isConnected
            ? 'var(--status-connected)'
            : isConnecting
            ? 'var(--status-connecting)'
            : 'var(--border-strong)',
        }}
        className={`
          relative z-10 w-44 h-44 sm:w-52 sm:h-52 rounded-full p-2.5 flex flex-col items-center justify-center
          border-[1.5px] cursor-pointer focus:outline-none
          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      >
        {/* Pre-composited Static Glow Underlay for Zero Repaint */}
        <div
          style={{
            transform: 'translateZ(0)',
            willChange: 'opacity',
            opacity: isConnected ? 1 : isConnecting ? 0.8 : 0,
            background: isConnected
              ? 'radial-gradient(circle, var(--status-connected-glow) 0%, transparent 80%)'
              : 'radial-gradient(circle, var(--status-connecting-glow) 0%, transparent 80%)',
          }}
          className="absolute inset-0 rounded-full transition-opacity duration-300 pointer-events-none"
          aria-hidden="true"
        />

        {/* Inner Icon Center Orb */}
        <div
          style={{
            transform: 'translateZ(0)',
            willChange: 'transform, background-color',
            background: isConnected
              ? 'var(--status-connected)'
              : isConnecting
              ? 'var(--status-connecting)'
              : 'rgba(255, 255, 255, 0.05)',
            color: isConnected || isConnecting ? '#ffffff' : 'var(--text-muted)',
          }}
          className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mb-2 transition-colors duration-200"
        >
          {isConnecting ? (
            <motion.div
              animate={isAppActive ? { rotate: 360 } : { rotate: 0 }}
              transition={{ repeat: isAppActive ? Infinity : 0, duration: 1.1, ease: 'linear' }}
              style={{
                transform: 'translateZ(0)',
                willChange: 'transform',
              }}
            >
              <RefreshCw className="w-9 h-9 sm:w-11 sm:h-11" />
            </motion.div>
          ) : isConnected ? (
            <ShieldCheck className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
          ) : (
            <Power className="w-10 h-10 sm:w-12 sm:h-12" />
          )}
        </div>

        {/* Status Text within Button */}
        <span
          style={{
            color: isConnected
              ? 'var(--status-connected)'
              : isConnecting
              ? 'var(--status-connecting)'
              : 'var(--text-secondary)',
          }}
          className="relative z-10 text-xs sm:text-sm font-bold tracking-wider uppercase"
        >
          {isConnecting
            ? t('dashboard.connecting')
            : isConnected
            ? t('dashboard.disconnect')
            : t('dashboard.connect')}
        </span>
      </motion.button>

      {/* Sub-label Instruction Node */}
      <div
        style={{
          transform: 'translateZ(0)',
          color: 'var(--text-muted)',
        }}
        className="mt-4 flex items-center gap-2 text-xs font-medium"
      >
        {isConnected ? (
          <span className="flex items-center gap-1.5" style={{ color: 'var(--status-connected)' }}>
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ background: 'var(--status-connected)' }}
            />
            {t('dashboard.protected')}
          </span>
        ) : isConnecting ? (
          <span className="flex items-center gap-1.5" style={{ color: 'var(--status-connecting)' }}>
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--status-connecting)' }}
            />
            {t('dashboard.connecting')}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            {t('dashboard.unprotected')}
          </span>
        )}
        <span>•</span>
        <span>{t('dashboard.tapToToggle')}</span>
      </div>
    </div>
  );
});

ConnectionShield.displayName = 'ConnectionShield';
