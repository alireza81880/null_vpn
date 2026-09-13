import React, { memo } from 'react';
import { ArrowDown, ArrowUp, Zap, Clock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n/I18nContext';

// ============================================================================
// Zero-Lag Metric Card Shell (Hardware-Accelerated & Theme Synchronized)
// ============================================================================

export interface MetricCardShellProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  tag?: string;
  tagColor?: string;
  value: string | number;
  unit?: string;
  subValue?: string;
  accentColor?: string;
  progressPercent?: number;
}

export const MetricCardShell: React.FC<MetricCardShellProps> = memo(
  ({
    id,
    icon,
    label,
    tag,
    tagColor = 'var(--text-muted)',
    value,
    unit,
    subValue,
    accentColor = 'var(--border-accent)',
    progressPercent,
  }) => {
    return (
      <div
        id={id}
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          backgroundColor: 'var(--bg-surface-glass)',
          borderColor: 'var(--border-glass)',
          boxShadow: 'var(--glass-shadow)',
          color: 'var(--text-primary)',
        }}
        className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-[var(--border-accent)] border backdrop-blur-2xl transition-colors duration-200"
      >
        {/* Top Glow Accent Strip */}
        <div
          className="absolute top-0 inset-x-0 h-0.5 opacity-50 group-hover:opacity-100 transition-opacity"
          style={{ background: accentColor }}
        />

        {/* Header: Label & Tag/Icon */}
        <div className="flex items-center justify-between mb-3">
          <span
            style={{ color: 'var(--text-secondary)' }}
            className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
          >
            <span style={{ color: accentColor }}>{icon}</span>
            {label}
          </span>
          {tag && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: `${tagColor}18`,
                borderColor: `${tagColor}35`,
                color: tagColor,
              }}
            >
              {tag}
            </span>
          )}
        </div>

        {/* Main Metric Value (Zero Transition, Tabular Nums to Prevent Paint Thrashing) */}
        <div className="my-1">
          <div className="flex items-baseline gap-1.5">
            <span
              data-telemetry-node="value"
              style={{ color: 'var(--text-primary)' }}
              className="telemetry-value text-2xl sm:text-3xl font-mono font-bold tracking-tight tabular-nums select-all"
            >
              {value}
            </span>
            {unit && (
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: accentColor }}
              >
                {unit}
              </span>
            )}
          </div>

          {subValue && (
            <div
              style={{ color: 'var(--text-muted)' }}
              className="mt-1 text-[11px] font-mono truncate"
            >
              {subValue}
            </div>
          )}
        </div>

        {/* Hardware-Accelerated Mini Progress Bar */}
        {progressPercent !== undefined && (
          <div
            style={{ backgroundColor: 'var(--border-subtle)' }}
            className="w-full rounded-full h-1 mt-3 overflow-hidden relative"
          >
            <div
              className="h-full rounded-full transition-transform duration-300 ease-out origin-left"
              style={{
                width: '100%',
                background: accentColor,
                transform: `scaleX(${Math.min(Math.max(progressPercent, 0), 100) / 100}) translateZ(0)`,
                willChange: 'transform',
              }}
            />
          </div>
        )}
      </div>
    );
  }
);

MetricCardShell.displayName = 'MetricCardShell';

// Legacy export for backwards compatibility
export type StatCardProps = MetricCardShellProps;
export const StatCard = MetricCardShell;

// ============================================================================
// ATOMIC MICRO-COMPONENTS (Isolated Zustand Primitive Selectors)
// ============================================================================

export const DownloadMetricNode: React.FC = memo(() => {
  const downloadSpeed = useAppStore((state) => state.stats.downloadSpeed);
  const totalReceived = useAppStore((state) => state.stats.totalReceived);
  const isConnected = useAppStore((state) => state.connectionState === 'connected');
  const { t } = useI18n();

  const formattedSpeed = isConnected && downloadSpeed > 0
    ? ((downloadSpeed * 8) / (1024 * 1024)).toFixed(1)
    : '0.0';

  const formattedTotal = isConnected && totalReceived > 0
    ? totalReceived / (1024 * 1024) < 1024
      ? `${(totalReceived / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalReceived / (1024 * 1024 * 1024)).toFixed(2)} GB`
    : '0 MB';

  const progressPercent = isConnected
    ? Math.min(100, (downloadSpeed / (150 * 1024 * 1024)) * 100)
    : 0;

  return (
    <MetricCardShell
      id="metric-download"
      icon={<ArrowDown className="w-3.5 h-3.5" />}
      label={t('telemetry.download')}
      tag="RX"
      tagColor="#3b82f6"
      value={formattedSpeed}
      unit={t('telemetry.mbps')}
      subValue={`Total: ${formattedTotal}`}
      accentColor="#3b82f6"
      progressPercent={progressPercent}
    />
  );
});

DownloadMetricNode.displayName = 'DownloadMetricNode';

export const UploadMetricNode: React.FC = memo(() => {
  const uploadSpeed = useAppStore((state) => state.stats.uploadSpeed);
  const totalSent = useAppStore((state) => state.stats.totalSent);
  const isConnected = useAppStore((state) => state.connectionState === 'connected');
  const { t } = useI18n();

  const formattedSpeed = isConnected && uploadSpeed > 0
    ? ((uploadSpeed * 8) / (1024 * 1024)).toFixed(1)
    : '0.0';

  const formattedTotal = isConnected && totalSent > 0
    ? totalSent / (1024 * 1024) < 1024
      ? `${(totalSent / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalSent / (1024 * 1024 * 1024)).toFixed(2)} GB`
    : '0 MB';

  const progressPercent = isConnected
    ? Math.min(100, (uploadSpeed / (50 * 1024 * 1024)) * 100)
    : 0;

  return (
    <MetricCardShell
      id="metric-upload"
      icon={<ArrowUp className="w-3.5 h-3.5" />}
      label={t('telemetry.upload')}
      tag="TX"
      tagColor="#8b5cf6"
      value={formattedSpeed}
      unit={t('telemetry.mbps')}
      subValue={`Total: ${formattedTotal}`}
      accentColor="#8b5cf6"
      progressPercent={progressPercent}
    />
  );
});

UploadMetricNode.displayName = 'UploadMetricNode';

export const LatencyMetricNode: React.FC = memo(() => {
  const latencyPing = useAppStore((state) => state.stats.latencyPing);
  const isConnected = useAppStore((state) => state.connectionState === 'connected');
  const { t } = useI18n();

  return (
    <MetricCardShell
      id="metric-latency"
      icon={<Zap className="w-3.5 h-3.5" />}
      label={t('telemetry.latency')}
      tag={isConnected ? 'Stable' : 'Idle'}
      tagColor={isConnected ? '#10b981' : 'var(--text-muted)'}
      value={isConnected ? latencyPing : '--'}
      unit={isConnected ? t('telemetry.ms') : ''}
      subValue={isConnected ? t('telemetry.liveThroughput') : 'RFC 8439 Tunnel'}
      accentColor="#10b981"
      progressPercent={isConnected ? Math.max(10, 100 - latencyPing) : 0}
    />
  );
});

LatencyMetricNode.displayName = 'LatencyMetricNode';

export const HandshakeMetricNode: React.FC = memo(() => {
  const lastHandshake = useAppStore((state) => state.stats.lastHandshake);
  const sessionUptime = useAppStore((state) => state.stats.sessionUptime);
  const isConnected = useAppStore((state) => state.connectionState === 'connected');
  const { t } = useI18n();

  return (
    <MetricCardShell
      id="metric-handshake"
      icon={<Clock className="w-3.5 h-3.5" />}
      label={t('telemetry.handshake')}
      tag={isConnected ? 'Active' : 'Standby'}
      tagColor={isConnected ? '#06b6d4' : 'var(--text-muted)'}
      value={isConnected ? lastHandshake : '--'}
      unit={isConnected ? t('telemetry.secAgo') : ''}
      subValue={isConnected ? `Uptime: ${sessionUptime}` : 'ChaCha20-Poly1305'}
      accentColor="#06b6d4"
    />
  );
});

HandshakeMetricNode.displayName = 'HandshakeMetricNode';

// ============================================================================
// STABLE TELEMETRY GRID CONTAINER
// ============================================================================

export const TelemetryGrid: React.FC = memo(() => {
  return (
    <div className="w-full mt-4">
      <div className="grid grid-cols-12 gap-3 sm:gap-4 md:gap-5">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <DownloadMetricNode />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <UploadMetricNode />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <LatencyMetricNode />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <HandshakeMetricNode />
        </div>
      </div>
    </div>
  );
});

TelemetryGrid.displayName = 'TelemetryGrid';
