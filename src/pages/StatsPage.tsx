import React from 'react';
import { Activity, Clock, Database, Radio, Zap } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n/I18nContext';

const UptimeStat: React.FC<{ isConnected: boolean }> = React.memo(({ isConnected }) => {
  const sessionUptime = useAppStore((state) => state.stats.sessionUptime);
  const { t } = useI18n();

  return (
    <div dir="ltr" className="glass-card p-4 text-left" style={{ backgroundColor: 'var(--bg-surface-glass)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
        <Clock className="w-4 h-4" />
        <span className="text-xs uppercase font-medium">{t('common.uptime')}</span>
      </div>
      <p className="text-lg sm:text-xl font-bold font-mono tabular-nums telemetry-value" style={{ color: 'var(--text-primary)' }}>
        {isConnected ? sessionUptime : '00:00:00'}
      </p>
    </div>
  );
});
UptimeStat.displayName = 'UptimeStat';

const DownloadTotalStat: React.FC<{ isConnected: boolean }> = React.memo(({ isConnected }) => {
  const totalReceived = useAppStore((state) => state.stats.totalReceived);
  const { t } = useI18n();

  return (
    <div dir="ltr" className="glass-card p-4 text-left" style={{ backgroundColor: 'var(--bg-surface-glass)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
        <Database className="w-4 h-4 text-emerald-400" />
        <span className="text-xs uppercase font-medium">{t('telemetry.download')}</span>
      </div>
      <p className="text-lg sm:text-xl font-bold font-mono text-emerald-400 tabular-nums telemetry-value">
        {isConnected ? `${(totalReceived / 1024 / 1024).toFixed(1)} MB` : '0 MB'}
      </p>
    </div>
  );
});
DownloadTotalStat.displayName = 'DownloadTotalStat';

const UploadTotalStat: React.FC<{ isConnected: boolean }> = React.memo(({ isConnected }) => {
  const totalSent = useAppStore((state) => state.stats.totalSent);
  const { t } = useI18n();

  return (
    <div dir="ltr" className="glass-card p-4 text-left" style={{ backgroundColor: 'var(--bg-surface-glass)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
        <Activity className="w-4 h-4 text-indigo-400" />
        <span className="text-xs uppercase font-medium">{t('telemetry.upload')}</span>
      </div>
      <p className="text-lg sm:text-xl font-bold font-mono text-indigo-400 tabular-nums telemetry-value">
        {isConnected ? `${(totalSent / 1024 / 1024).toFixed(1)} MB` : '0 MB'}
      </p>
    </div>
  );
});
UploadTotalStat.displayName = 'UploadTotalStat';

const HandshakeStat: React.FC<{ isConnected: boolean }> = React.memo(({ isConnected }) => {
  const lastHandshake = useAppStore((state) => state.stats.lastHandshake);
  const { t } = useI18n();

  return (
    <div dir="ltr" className="glass-card p-4 text-left" style={{ backgroundColor: 'var(--bg-surface-glass)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
        <Radio className="w-4 h-4" />
        <span className="text-xs uppercase font-medium">{t('telemetry.handshake')}</span>
      </div>
      <p className="text-lg sm:text-xl font-bold font-mono tabular-nums telemetry-value" style={{ color: isConnected ? 'var(--status-connected)' : 'var(--text-muted)' }}>
        {isConnected ? `${lastHandshake} ${t('telemetry.secAgo')}` : '--'}
      </p>
    </div>
  );
});
HandshakeStat.displayName = 'HandshakeStat';

export const StatsPage: React.FC = () => {
  const isConnected = useAppStore((state) => state.connectionState === 'connected');
  const { t } = useI18n();

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {t('nav.stats')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('telemetry.liveThroughput')}
        </p>
      </div>

      {/* Metrics Row (Isolated micro-components) */}
      <div dir="ltr" className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
        <UptimeStat isConnected={isConnected} />
        <DownloadTotalStat isConnected={isConnected} />
        <UploadTotalStat isConnected={isConnected} />
        <HandshakeStat isConnected={isConnected} />
      </div>

      {/* Throughput Graph */}
      <div dir="ltr" className="glass-card p-5 text-left" style={{ backgroundColor: 'var(--bg-surface-glass)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('telemetry.liveThroughput')}
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {t('telemetry.peakThroughput')}: {isConnected ? `142 ${t('telemetry.mbps')}` : `0 ${t('telemetry.mbps')}`}
          </span>
        </div>

        <div className="h-44 w-full flex items-end gap-1.5 pt-6">
          {(isConnected
            ? [24, 45, 62, 38, 55, 78, 90, 84, 110, 95, 120, 134, 142, 130, 98, 112, 128, 145, 138, 125, 140, 135, 142, 138, 142]
            : [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
          ).map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full rounded-t transition-all group-hover:opacity-100 opacity-80"
                style={{
                  height: `${Math.max(4, (val / 142) * 100)}%`,
                  backgroundColor: isConnected ? 'var(--accent-primary)' : 'var(--border-strong)',
                  boxShadow: isConnected ? '0 0 8px var(--accent-glow)' : 'none',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
