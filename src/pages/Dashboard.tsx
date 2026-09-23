import React, { useState, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Cpu,
  Sparkles,
  FilePlus,
  ChevronDown,
  Check,
  Plus,
  Zap,
  Server,
  Layers,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useAppStore, useActiveConfig } from '../store/useAppStore';
import { useTunnelStore, useActiveTunnel } from '../store/useTunnelStore';
import { useI18n } from '../i18n/I18nContext';
import { useVpnEngine } from '../hooks/useVpnEngine';
import { BentoCard } from '../components/ui/BentoCard';
import { LiquidButton } from '../components/ui/LiquidButton';
import { ConnectionNode } from '../components/dashboard/ConnectionNode';
import { TelemetryGrid } from '../components/dashboard/TelemetryGrid';
import { MainConnectButton } from '../components/dashboard/MainConnectButton';
import { ImportModal } from '../components/modals/ImportModal';

export const Dashboard: React.FC = () => {
  const configs = useAppStore((state) => state.configs);
  const activeConfigId = useAppStore((state) => state.activeConfigId);
  const setActiveConfigId = useAppStore((state) => state.setActiveConfigId);
  const connectionState = useAppStore((state) => state.connectionState);
  const importSampleConfig = useAppStore((state) => state.importSampleConfig);

  const tunnels = useTunnelStore((state) => state.tunnels);
  const activeTunnelId = useTunnelStore((state) => state.activeTunnelId);
  const setActiveTunnel = useTunnelStore((state) => state.setActiveTunnel);

  // Dynamic reactive selectors
  const activeTunnel = useActiveTunnel();
  const activeConfig = useActiveConfig();

  const { toggle, error, clearError, isMobile, isElectron } = useVpnEngine();

  const { t } = useI18n();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTunnelDropdownOpen, setIsTunnelDropdownOpen] = useState(false);

  // Real-time reactive tunnel identification across both stores
  const activeTunnelName =
    activeTunnel?.name ||
    activeConfig?.name ||
    tunnels.find((t) => t.id === activeTunnelId)?.name ||
    configs.find((c) => c.id === activeConfigId)?.name ||
    tunnels[0]?.name ||
    configs[0]?.name ||
    'No Profile';

  const activeEndpoint =
    activeTunnel?.endpoint ||
    activeConfig?.endpoint ||
    tunnels.find((t) => t.id === activeTunnelId)?.endpoint ||
    configs.find((c) => c.id === activeConfigId)?.endpoint ||
    tunnels[0]?.endpoint ||
    configs[0]?.endpoint ||
    '';

  const activeClientIp =
    activeTunnel?.wireguard?.address ||
    activeConfig?.interface?.address ||
    '10.14.0.2/32';

  const hasAnyTunnels = tunnels.length > 0 || configs.length > 0;
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  const handleLoadSample = () => {
    importSampleConfig();
    const sampleWG = `[Interface]
PrivateKey = QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=
Address = 10.14.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = p4+N8yK8wM1qW1N9V2v6X7x+K1u9Z4t8Q3b2Y5c6F7A=
Endpoint = frankfurt.edge.aegis-vpn.io:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;
    useTunnelStore.getState().addTunnel(sampleWG);
  };

  // Unified tunnel items for switching
  const displayedTunnels = tunnels.length > 0
    ? tunnels.map((t) => ({ id: t.id, name: t.name, endpoint: t.endpoint }))
    : configs.map((c) => ({ id: c.id, name: c.name, endpoint: c.endpoint }));

  // ==========================================================================
  // 1. EMPTY STATE BENTO ARCHITECTURE (Zero-Trust Configuration Vault)
  // ==========================================================================
  if (!hasAnyTunnels) {
    return (
      <div className="w-full max-w-4xl mx-auto py-6 sm:py-10">
        <div className="grid grid-cols-12 gap-4 md:gap-5">
          {/* Main Empty State Bento Box */}
          <BentoCard
            colSpan="col-span-12"
            className="p-8 sm:p-12 text-center relative overflow-hidden border-dashed border-2"
          >
            {/* Ambient Background Spotlight */}
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none opacity-15 blur-3xl bg-[var(--accent-primary)]"
              aria-hidden="true"
            />

            {/* Glowing Center Hologram Shield */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-accent)',
                boxShadow: '0 0 32px var(--accent-glow)',
              }}
              className="relative mx-auto mb-6 w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border flex items-center justify-center"
            >
              <Shield
                className="w-10 h-10 sm:w-12 sm:h-12"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>

            {/* Spec Tag */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--accent-primary)',
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium mb-4 border"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{t('dashboard.specBadge')}</span>
            </div>

            {/* Header & Description */}
            <h2
              style={{ color: 'var(--text-primary)' }}
              className="text-xl sm:text-3xl font-bold tracking-tight mb-2"
            >
              {t('dashboard.emptyTitle')}
            </h2>
            <p
              style={{ color: 'var(--text-secondary)' }}
              className="text-xs sm:text-sm leading-relaxed max-w-lg mx-auto mb-8"
            >
              {t('dashboard.emptyDescription')}
            </p>

            {/* LiquidButton Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
              <LiquidButton
                id="btn-import-profile"
                variant="primary"
                morphology="pill"
                size="lg"
                className="w-full sm:w-auto"
                icon={<FilePlus className="w-4 h-4" />}
                onClick={() => setIsImportModalOpen(true)}
              >
                {t('dashboard.importProfile')}
              </LiquidButton>

              <LiquidButton
                id="btn-load-sample"
                variant="secondary"
                morphology="pill"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Sparkles className="w-4 h-4 text-blue-400" />}
                onClick={handleLoadSample}
              >
                {t('dashboard.loadSample')}
              </LiquidButton>
            </div>
          </BentoCard>
        </div>

        {/* Import Modal */}
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      </div>
    );
  }

  // ==========================================================================
  // 2. ACTIVE BENTO GRID TELEMETRY DASHBOARD
  // ==========================================================================
  return (
    <div className="w-full max-w-5xl mx-auto py-2 sm:py-4 space-y-4 md:space-y-5">
      {/* Real-time Daemon IPC Error Notification */}
      {error && (
        <div
          id="vpn-daemon-error-banner"
          className="w-full rounded-2xl bg-rose-950/80 border border-rose-500/50 p-4 flex items-center justify-between gap-3 text-xs text-rose-200 shadow-[0_8px_32px_rgba(225,29,72,0.25)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-rose-100 tracking-tight">sing-box Daemon Notice</p>
              <p className="font-mono text-[11px] text-rose-300 truncate">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors shrink-0 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          HERO BENTO BOX: Cryptographic Core & Connection Controller
          ==================================================================== */}
      <BentoCard
        colSpan="col-span-12"
        className="relative overflow-visible"
        bodyClassName="p-5 sm:p-7"
      >
        {/* Top Control Bar: Active Tunnel Pill & Status Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 min-w-0">
          {/* Active Tunnel Switcher Pill */}
          <div className="relative min-w-0 max-w-full sm:max-w-md">
            <button
              type="button"
              id="btn-toggle-tunnel-dropdown"
              onClick={() => setIsTunnelDropdownOpen(!isTunnelDropdownOpen)}
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-glass)',
                color: 'var(--text-primary)',
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer max-w-full min-w-0"
              title={activeTunnelName}
            >
              <div
                style={{ backgroundColor: 'var(--accent-primary)' }}
                className="w-2 h-2 rounded-full animate-pulse shrink-0"
              />
              <Server
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--accent-primary)' }}
              />
              <span className="font-mono tracking-tight truncate max-w-[120px] sm:max-w-[180px] overflow-hidden whitespace-nowrap block">{activeTunnelName}</span>
              <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform shrink-0 ${isTunnelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Context-Aware Tunnel Dropdown Menu */}
            {isTunnelDropdownOpen && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-glass)',
                  boxShadow: 'var(--glass-shadow)',
                  color: 'var(--text-primary)',
                }}
                className="absolute top-full left-0 mt-2 w-64 rounded-2xl border p-2 z-50 backdrop-blur-2xl"
              >
                <div
                  style={{
                    color: 'var(--text-muted)',
                    borderBottomColor: 'var(--border-subtle)',
                  }}
                  className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border-b mb-1 flex items-center justify-between"
                >
                  <span>Switch Tunnel</span>
                  <span
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      color: 'var(--text-secondary)',
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                  >
                    {displayedTunnels.length}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {displayedTunnels.map((c) => {
                    const isSelected =
                      c.id === activeTunnelId ||
                      c.id === activeConfigId ||
                      c.name === activeTunnelName;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setActiveTunnel(c.id);
                          setActiveConfigId(c.id);
                          setIsTunnelDropdownOpen(false);
                        }}
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'transparent',
                          borderColor: isSelected
                            ? 'var(--accent-primary)'
                            : 'transparent',
                          color: isSelected
                            ? 'var(--accent-primary)'
                            : 'var(--text-secondary)',
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border hover:bg-[var(--bg-surface-hover)]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Layers className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{c.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{ borderTopColor: 'var(--border-subtle)' }}
                  className="pt-2 border-t mt-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsTunnelDropdownOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    style={{
                      color: 'var(--text-secondary)',
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Import New Config</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Connection State & Platform Engine Badges */}
          <div className="flex items-center gap-2">
            {/* Dynamic Native Runtime Indicator */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border"
            >
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>
                {isMobile
                  ? 'Capacitor · VpnService'
                  : isElectron
                  ? 'Electron · IPC Daemon'
                  : 'Web Preview'}
              </span>
            </div>

            {/* Connection State Pill */}
            <div
              style={{
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
                boxShadow: isConnected
                  ? '0 0 16px var(--status-connected-glow)'
                  : isConnecting
                  ? '0 0 16px var(--status-connecting-glow)'
                  : 'none',
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-semibold border"
            >
              <span
                style={{
                  backgroundColor: isConnected
                    ? 'var(--status-connected)'
                    : isConnecting
                    ? 'var(--status-connecting)'
                    : 'var(--text-muted)',
                }}
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'animate-radar-ping'
                    : isConnecting
                    ? 'animate-pulse'
                    : ''
                }`}
              />
              <span className="tracking-wide">
                {isConnected
                  ? t('dashboard.connected')
                  : isConnecting
                  ? t('dashboard.connecting')
                  : t('dashboard.disconnected')}
              </span>
            </div>
          </div>
        </div>

        {/* Central Holographic Flow Node (Device -> Tunnel -> Endpoint) */}
        <div className="my-3 sm:my-5 w-full min-w-0 overflow-hidden">
          <ConnectionNode
            connectionState={connectionState}
            endpoint={activeEndpoint}
            clientIp={activeClientIp}
            cipher="ChaCha20-Poly1305"
            tunnelName={activeTunnelName}
          />
        </div>

        {/* Primary Action Button */}
        <div
          style={{ borderTopColor: 'var(--border-subtle)' }}
          className="w-full flex flex-col items-center justify-center mt-6 pt-5 border-t"
        >
          <MainConnectButton
            id="btn-main-connection-toggle"
            connectionState={connectionState}
            isConnecting={isConnecting}
            onClick={toggle}
          />
        </div>
      </BentoCard>

      {/* ====================================================================
          TELEMETRY BENTO GRID: 4-Box Metric Array (Split-Second Scanning)
          Isolated Micro-Components with Atomic Zustand Primitive Selectors
          ==================================================================== */}
      <TelemetryGrid />

      {/* ====================================================================
          SECURITY PARAMETERS BENTO BAR: Zero-Trust Hardware Guarantees
          ==================================================================== */}
      <BentoCard
        colSpan="col-span-12"
        bodyClassName="p-4 sm:p-5"
      >
        <div dir="ltr" className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-left">
          {/* ChaCha20 Cipher Chip */}
          <div
            dir="ltr"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left"
          >
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            <span style={{ color: 'var(--text-primary)' }} className="font-semibold">Cipher:</span>
            <span>{t('common.protocolCipher')}</span>
          </div>

          {/* Curve25519 Chip */}
          <div
            dir="ltr"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span style={{ color: 'var(--text-primary)' }} className="font-semibold">Curve:</span>
            <span>Curve25519 ECDH</span>
          </div>

          {/* Kill Switch Chip */}
          <div
            dir="ltr"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{t('dashboard.killSwitch')}:</span>
            <span className="text-emerald-400">Enforced</span>
          </div>

          {/* DNS Shield Chip */}
          <div
            dir="ltr"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{t('dashboard.dnsShield')}:</span>
            <span className="text-emerald-400">1.1.1.1 DoH</span>
          </div>
        </div>
      </BentoCard>

      {/* Import WireGuard Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
