import React, { memo, useState, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import {
  Shield,
  Trash2,
  Edit3,
  CheckCircle2,
  Circle,
  Radio,
  Wifi,
  Globe,
  Lock,
} from 'lucide-react';
import type { TunnelItem, TunnelProtocol } from '../../store/useTunnelStore';

export interface TunnelCardProps {
  tunnel: TunnelItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (tunnel: TunnelItem) => void;
}

// Generate stable deterministic ping based on tunnel endpoint/id
const getStablePing = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 110) + 26; // Between 26ms and 135ms
};

// Protocol badge styles
const PROTOCOL_CONFIG: Record<
  TunnelProtocol,
  { label: string; color: string; bg: string; border: string; glow: string }
> = {
  wireguard: {
    label: 'WireGuard',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    glow: 'rgba(59, 130, 246, 0.25)',
  },
  vless: {
    label: 'VLESS',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
    glow: 'rgba(139, 92, 246, 0.25)',
  },
  trojan: {
    label: 'Trojan',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.35)',
    glow: 'rgba(6, 182, 212, 0.25)',
  },
  vmess: {
    label: 'VMess',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.35)',
    glow: 'rgba(249, 115, 22, 0.25)',
  },
  shadowsocks: {
    label: 'Shadowsocks',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    glow: 'rgba(16, 185, 129, 0.25)',
  },
};

/**
 * TunnelCard (Swipeable Liquid Bento Card)
 * 
 * Performance & Architecture:
 * - Memoized component with atomic rendering isolation.
 * - Hardware acceleration via translateZ(0) to eliminate GPU paint thrashing during gestures.
 * - Swipeable Mobile Gestures (Left -> Delete, Right -> Edit) via Framer Motion.
 * - Dynamic theme adaptation using CSS variables.
 */
export const TunnelCard: React.FC<TunnelCardProps> = memo(({
  tunnel,
  isActive,
  onSelect,
  onDelete,
  onEdit,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isTapped, setIsTapped] = useState(false);

  const x = useMotionValue(0);
  const leftActionOpacity = useTransform(x, [10, 60], [0, 1]);
  const rightActionOpacity = useTransform(x, [-10, -60], [0, 1]);

  const ping = useMemo(() => getStablePing(tunnel.id + tunnel.endpoint), [tunnel.id, tunnel.endpoint]);

  // Ping dot color determination
  const pingConfig = useMemo(() => {
    if (ping < 70) {
      return { color: '#10b981', label: `${ping}ms`, textClass: 'text-emerald-400' };
    }
    if (ping < 120) {
      return { color: '#f59e0b', label: `${ping}ms`, textClass: 'text-amber-400' };
    }
    return { color: '#ef4444', label: `${ping}ms`, textClass: 'text-rose-400' };
  }, [ping]);

  const proto = PROTOCOL_CONFIG[tunnel.protocol] || PROTOCOL_CONFIG.wireguard;

  // Handle tap vs drag
  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // If drag offset was minimal, treat as selection tap
      if (Math.abs(x.get()) < 6) {
        setIsTapped(true);
        setTimeout(() => setIsTapped(false), 280);
        onSelect(tunnel.id);
      }
    },
    [onSelect, tunnel.id, x]
  );

  const handleDragEnd = useCallback(
    (_: any, info: { offset: { x: number } }) => {
      if (info.offset.x < -60) {
        onDelete?.(tunnel.id);
      } else if (info.offset.x > 60) {
        onEdit?.(tunnel);
      }
    },
    [onDelete, onEdit, tunnel]
  );

  return (
    <div
      id={`tunnel-item-container-${tunnel.id}`}
      className="relative overflow-hidden rounded-2xl select-none group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
      {/* ====================================================================
          UNDERLYING SWIPE ACTION REVEAL LAYER
          ==================================================================== */}
      {/* 1. Left Background: Edit Action (revealed on swiping right) */}
      <motion.div
        style={{ opacity: leftActionOpacity }}
        className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-blue-600 to-blue-500 rounded-l-2xl flex items-center justify-start pl-5 text-white shadow-inner pointer-events-none"
      >
        <div className="flex flex-col items-center gap-1">
          <Edit3 className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Edit</span>
        </div>
      </motion.div>

      {/* 2. Right Background: Delete Action (revealed on swiping left) */}
      <motion.div
        style={{ opacity: rightActionOpacity }}
        className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-rose-600 to-rose-700 rounded-r-2xl flex items-center justify-end pr-5 text-white shadow-inner pointer-events-none"
      >
        <div className="flex flex-col items-center gap-1">
          <Trash2 className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Delete</span>
        </div>
      </motion.div>

      {/* ====================================================================
          FOREGROUND SWIPEABLE BENTO CARD
          ==================================================================== */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 80 }}
        dragElastic={0.18}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        onClick={handleCardClick}
        style={{
          x,
          transform: 'translateZ(0)',
          willChange: 'transform',
          backgroundColor: 'var(--bg-surface-glass)',
          borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-glass)',
          boxShadow: isActive
            ? '0 0 0 1.5px var(--accent-primary), 0 0 24px var(--accent-glow)'
            : isHovered
            ? '0 4px 20px var(--glass-shadow)'
            : 'var(--glass-shadow)',
          color: 'var(--text-primary)',
        }}
        animate={{
          scale: isTapped ? 0.98 : 1,
        }}
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        className={`
          relative z-10 p-4 sm:p-5 rounded-2xl border backdrop-blur-2xl
          cursor-pointer transition-colors duration-200
        `}
      >
        {/* Subtle Top Active Glow Accent */}
        {isActive && (
          <div
            className="absolute top-0 inset-x-0 h-0.5"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
            }}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon & Tunnel Metadata */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Active Indicator Radio / Status Avatar */}
            <div
              style={{
                backgroundColor: isActive
                  ? 'rgba(59, 130, 246, 0.18)'
                  : 'var(--bg-surface-elevated)',
                borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-200"
            >
              {isActive ? (
                <Radio className="w-5 h-5 animate-pulse" />
              ) : (
                <Globe className="w-5 h-5 opacity-70" />
              )}
            </div>

            {/* Title, Endpoint & Protocol Badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4
                  style={{ color: 'var(--text-primary)' }}
                  className="text-sm font-bold tracking-tight truncate max-w-[180px] sm:max-w-xs"
                >
                  {tunnel.name}
                </h4>

                {/* Protocol Badge (Subtle Glowing Pill) */}
                <span
                  style={{
                    backgroundColor: proto.bg,
                    borderColor: proto.border,
                    color: proto.color,
                    boxShadow: `0 0 10px ${proto.glow}`,
                  }}
                  className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wide"
                >
                  {proto.label}
                </span>

                {/* TLS/Reality Tag if present */}
                {tunnel.security && tunnel.security !== 'none' && (
                  <span
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 uppercase"
                  >
                    {tunnel.security}
                  </span>
                )}
              </div>

              {/* Endpoint Address */}
              <div
                style={{ color: 'var(--text-muted)' }}
                className="text-xs font-mono flex items-center gap-1.5 truncate"
              >
                <Lock className="w-3 h-3 opacity-60 shrink-0" />
                <span className="truncate">{tunnel.endpoint}</span>
              </div>
            </div>
          </div>

          {/* Right: Simulated Ping Dot & Desktop Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Simulated Ping Dot & Latency */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
              title={`Simulated Latency: ${pingConfig.label}`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: pingConfig.color,
                  boxShadow: `0 0 8px ${pingConfig.color}`,
                }}
              />
              <span className="text-[10px] font-mono font-medium text-[var(--text-secondary)]">
                {pingConfig.label}
              </span>
            </div>

            {/* Active Checkmark */}
            {isActive ? (
              <div
                style={{ color: 'var(--accent-primary)' }}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : (
              <div
                style={{ color: 'var(--text-muted)' }}
                className="w-8 h-8 rounded-xl flex items-center justify-center opacity-40 group-hover:opacity-80 transition-opacity"
              >
                <Circle className="w-4 h-4" />
              </div>
            )}

            {/* Desktop Quick Actions (Visible on md+ screens or hover) */}
            <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-[var(--border-subtle)]">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(tunnel);
                  }}
                  title="Edit Configuration"
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(tunnel.id);
                  }}
                  title="Delete Configuration"
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

TunnelCard.displayName = 'TunnelCard';
