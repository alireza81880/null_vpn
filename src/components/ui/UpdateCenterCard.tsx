import React, { useState } from 'react';
import {
  DownloadCloud,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  FileDown,
  ShieldCheck,
} from 'lucide-react';
import { BentoCard } from './BentoCard';
import {
  checkForAppUpdates,
  startApkUpdate,
  CURRENT_APP_VERSION,
  type UpdateInfo,
  type DownloadProgress,
} from '../../utils/appUpdateService';

export const UpdateCenterCard: React.FC = () => {
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const handleCheck = async () => {
    setIsChecking(true);
    setInstallError(null);
    try {
      const info = await checkForAppUpdates();
      setUpdateInfo(info);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Update check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!updateInfo?.apkUrl) return;
    setIsDownloading(true);
    setInstallError(null);
    try {
      const res = await startApkUpdate(updateInfo.apkUrl, (progress) => {
        setDownloadProgress(progress);
      });
      if (!res.success) {
        setInstallError(res.error || 'Failed to start installer');
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <BentoCard
      title="Software Update Center"
      subtitle={`Current Version: v${CURRENT_APP_VERSION}`}
      badge="Auto-Updater"
      icon={<DownloadCloud className="w-4 h-4 text-sky-400" />}
      glow="blue"
    >
      <div className="space-y-4">
        {/* Status / Check Trigger Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Release Channel: Official Stable
              </span>
              {updateInfo?.hasUpdate && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v{updateInfo.latestVersion} Available
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              Direct GitHub release pipeline with package verification
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheck}
            disabled={isChecking || isDownloading}
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer shadow-sm hover:scale-[1.02]"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--accent-foreground)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {/* Error Alert */}
        {installError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{installError}</span>
          </div>
        )}

        {/* Update Details Box if checked */}
        {updateInfo && (
          <div
            className="p-4 rounded-2xl border space-y-3 transition-all"
            style={{
              backgroundColor: 'var(--bg-surface-glass)',
              borderColor: updateInfo.hasUpdate ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            {updateInfo.hasUpdate ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      New Update Ready: {updateInfo.releaseName}
                    </h4>
                    <span className="text-[11px] text-gray-400">
                      Published: {new Date(updateInfo.publishedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {updateInfo.apkSize ? (
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300">
                      {formatBytes(updateInfo.apkSize)}
                    </span>
                  ) : null}
                </div>

                {/* Changelog Box */}
                <div
                  className="p-3 rounded-xl bg-black/40 border border-white/5 max-h-36 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap select-text scrollbar-thin"
                >
                  {updateInfo.body}
                </div>

                {/* Download Progress Bar */}
                {downloadProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-mono text-gray-400">
                      <span>{downloadProgress.status}</span>
                      <span>
                        {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)} ({downloadProgress.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${downloadProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Controls */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={isDownloading}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer hover:scale-[1.01]"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary) 0%, #059669 100%)',
                      color: '#ffffff',
                    }}
                  >
                    <FileDown className="w-4 h-4" />
                    {isDownloading ? 'Downloading & Launching Installer...' : 'Install Update (APK)'}
                  </button>

                  <a
                    href={updateInfo.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl border text-xs flex items-center justify-center transition-all hover:bg-white/5"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                    title="View on GitHub"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Null VPN is up to date
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Version v{CURRENT_APP_VERSION} is the latest released version.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </BentoCard>
  );
};
