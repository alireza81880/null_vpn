import React, { memo } from 'react';
import { Laptop, Globe, Lock, ShieldCheck, Zap, Wifi } from 'lucide-react';
import type { ConnectionState } from '../../types/vpn';
import { useAppStore } from '../../store/useAppStore';

export interface ConnectionNodeProps {
  connectionState: ConnectionState;
  endpoint?: string;
  clientIp?: string;
  latencyPing?: number;
  cipher?: string;
  tunnelName?: string;
}

/**
 * ConnectionNode (Holographic Tunnel Gateway - Fully Theme-Synchronized)
 * 
 * - Displays Local Device -> Encrypted WireGuard Tunnel -> Remote Endpoint.
 * - Uses dynamic CSS variables exclusively for all states.
 */
const LatencyBadge: React.FC<{ connectionState: ConnectionState; explicitPing?: number }> = memo(
  ({ connectionState, explicitPing }) => {
    const storePing = useAppStore((state) => state.stats.latencyPing);
    const latencyPing = explicitPing ?? storePing;
    const isConnected = connectionState === 'connected';
    const isConnecting = connectionState === 'connecting';

    return (
      <span
        style={{
          transform: 'translateZ(0)',
          backgroundColor: isConnected
            ? 'rgba(16, 185, 129, 0.15)'
            : isConnecting
            ? 'rgba(245, 158, 11, 0.15)'
            : 'var(--bg-surface-elevated)',
          borderColor: isConnected
            ? 'var(--status-connected)'
            : isConnecting
            ? 'var(--status-connecting)'
            : 'var(--border-subtle)',
          color: isConnected
            ? 'var(--status-connected)'
            : isConnecting
            ? 'var(--status-connecting)'
            : 'var(--text-muted)',
        }}
        className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border tabular-nums transition-none"
      >
        <Wifi className="w-2.5 h-2.5" />
        {isConnected ? `${latencyPing} ms` : isConnecting ? 'Syncing...' : 'Offline'}
      </span>
    );
  }
);
LatencyBadge.displayName = 'LatencyBadge';

export const ConnectionNode: React.FC<ConnectionNodeProps> = memo(({
  connectionState,
  endpoint = '198.51.100.42:51820',
  clientIp = '10.14.0.2/32',
  latencyPing,
  cipher = 'ChaCha20-Poly1305',
  tunnelName = 'Frankfurt-Edge-01',
}) => {
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isAppActive = useAppStore((state) => state.isAppActive);

  return (
    <div
      dir="ltr"
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
      className="w-full py-2 select-none text-left min-w-0 overflow-hidden"
    >
      {/* Node Flow Track */}
      <div className="relative flex flex-row items-center justify-between w-full min-w-0 gap-1.5 sm:gap-3 px-1 sm:px-2">
        {/* 1. Client Endpoint Node */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 z-10 min-w-0 shrink flex-1 max-w-[110px] sm:max-w-[140px]">
          <div
            style={{
              backgroundColor: isConnected
                ? 'rgba(59, 130, 246, 0.18)'
                : 'var(--bg-surface-elevated)',
              borderColor: isConnected
                ? 'var(--accent-primary)'
                : 'var(--border-subtle)',
              color: isConnected
                ? 'var(--accent-primary)'
                : 'var(--text-secondary)',
              boxShadow: isConnected
                ? '0 0 20px var(--accent-glow)'
                : 'none',
            }}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 shrink-0"
          >
            <Laptop className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="w-full flex flex-col items-center min-w-0 overflow-hidden">
            <span
              style={{ color: 'var(--text-primary)' }}
              className="w-full text-center text-[10px] sm:text-[11px] font-bold tracking-tight truncate overflow-hidden whitespace-nowrap block"
            >
              Local Client
            </span>
            <span
              style={{ color: 'var(--text-muted)' }}
              className="w-full text-center text-[9px] sm:text-[10px] font-mono tracking-tighter truncate overflow-hidden whitespace-nowrap block"
              title={isConnected ? clientIp : '127.0.0.1'}
            >
              {isConnected ? clientIp : '127.0.0.1'}
            </span>
          </div>
        </div>

        {/* 2. Interactive SVG Data Tunnel with Animated Pulse */}
        <div className="flex-1 min-w-0 relative flex flex-col items-center justify-center px-1 sm:px-2 overflow-hidden">
          {/* Cryptographic Badge Above Tunnel */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            className="mb-1.5 sm:mb-2 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border text-[9px] sm:text-[10px] font-mono backdrop-blur-md max-w-full min-w-0 overflow-hidden"
          >
            <Lock
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0"
              style={{
                color: isConnected
                  ? 'var(--accent-primary)'
                  : isConnecting
                  ? 'var(--status-connecting)'
                  : 'var(--text-muted)',
              }}
            />
            <span className="truncate min-w-0">{cipher}</span>
          </div>

          {/* Heavy SVG Optical Track */}
          <div className="w-full relative h-6 flex items-center min-w-0">
            <svg
              className="w-full h-full"
              preserveAspectRatio="none"
              viewBox="0 0 300 24"
            >
              <defs>
                <linearGradient id="tunnelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient id="tunnelGradientInactive" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--border-subtle)" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="var(--border-strong)" stopOpacity="0.8" />
                </linearGradient>

                <filter id="laserGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Base Track */}
              <line
                x1="0"
                y1="12"
                x2="300"
                y2="12"
                stroke={isConnected ? 'url(#tunnelGradient)' : isConnecting ? '#F59E0B' : 'url(#tunnelGradientInactive)'}
                strokeWidth={isConnected ? '2.5' : '1.5'}
                strokeDasharray={isConnected ? 'none' : '4 4'}
                filter={isConnected ? 'url(#laserGlow)' : undefined}
                className={isConnecting ? 'animate-pulse' : ''}
              />

              {/* Animated Laser Packets when Connected & App Active (Battery Preserved) */}
              {isConnected && isAppActive && (
                <>
                  <circle r="3.5" fill="#60A5FA" filter="url(#laserGlow)">
                    <animate
                      attributeName="cx"
                      from="10"
                      to="290"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      values="12;11;12"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="2.5" fill="#A78BFA" filter="url(#laserGlow)">
                    <animate
                      attributeName="cx"
                      from="290"
                      to="10"
                      dur="2.2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      values="12;13;12"
                      dur="2.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </>
              )}
            </svg>

            {/* Central Tunnel Core Icon */}
            <div
              style={{
                backgroundColor: isConnected
                  ? 'var(--accent-primary)'
                  : isConnecting
                  ? 'var(--status-connecting)'
                  : 'var(--bg-surface-elevated)',
                borderColor: isConnected
                  ? 'var(--accent-primary)'
                  : isConnecting
                  ? 'var(--status-connecting)'
                  : 'var(--border-subtle)',
                color: isConnected || isConnecting ? '#ffffff' : 'var(--text-muted)',
                boxShadow: isConnected
                  ? '0 0 18px var(--accent-glow)'
                  : 'none',
              }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border backdrop-blur-xl transition-all duration-300"
            >
              {isConnected ? (
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : isConnecting ? (
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </div>
          </div>

          {/* Real-time Latency Radar / Protocol Label (Isolated from SVG paths) */}
          <div className="mt-1.5 sm:mt-2 flex items-center justify-center gap-1 sm:gap-2 max-w-full min-w-0 overflow-hidden">
            <LatencyBadge connectionState={connectionState} explicitPing={latencyPing} />
          </div>
        </div>

        {/* 3. Server Gateway Node */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 z-10 min-w-0 shrink flex-1 max-w-[110px] sm:max-w-[140px]">
          <div
            style={{
              backgroundColor: isConnected
                ? 'rgba(139, 92, 246, 0.18)'
                : 'var(--bg-surface-elevated)',
              borderColor: isConnected
                ? 'var(--accent-secondary)'
                : 'var(--border-subtle)',
              color: isConnected
                ? 'var(--accent-secondary)'
                : 'var(--text-secondary)',
              boxShadow: isConnected
                ? '0 0 20px var(--accent-purple-glow)'
                : 'none',
            }}
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 shrink-0"
          >
            <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="w-full flex flex-col items-center min-w-0 overflow-hidden">
            <span
              style={{ color: 'var(--text-primary)' }}
              className="w-full text-center text-[10px] sm:text-[11px] font-bold tracking-tight truncate overflow-hidden whitespace-nowrap block"
              title={tunnelName}
            >
              {tunnelName}
            </span>
            <span
              style={{ color: 'var(--text-muted)' }}
              className="w-full text-center text-[9px] sm:text-[10px] font-mono tracking-tighter truncate overflow-hidden whitespace-nowrap block"
              title={endpoint}
            >
              {endpoint}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

ConnectionNode.displayName = 'ConnectionNode';
