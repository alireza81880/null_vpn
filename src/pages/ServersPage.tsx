import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Plus,
  Search,
  Sparkles,
  Shield,
  FilePlus,
  Filter,
  Check,
  X,
  Edit3,
} from 'lucide-react';
import { useTunnelStore, type TunnelItem, type TunnelProtocol } from '../store/useTunnelStore';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n/I18nContext';
import { TunnelCard } from '../components/vpn/TunnelCard';
import { ImportModal } from '../components/modals/ImportModal';
import { LiquidButton } from '../components/ui/LiquidButton';
import { BentoCard } from '../components/ui/BentoCard';

export const ServersPage: React.FC = () => {
  const { t } = useI18n();

  // Zustand subscriptions
  const tunnels = useTunnelStore((state) => state.tunnels);
  const activeTunnelId = useTunnelStore((state) => state.activeTunnelId);
  const setActiveTunnel = useTunnelStore((state) => state.setActiveTunnel);
  const removeTunnel = useTunnelStore((state) => state.removeTunnel);
  const updateTunnel = useTunnelStore((state) => state.updateTunnel);
  const importSampleConfig = useAppStore((state) => state.importSampleConfig);

  // Local UI State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('all');
  const [editingTunnel, setEditingTunnel] = useState<TunnelItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editEndpoint, setEditEndpoint] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Available protocols and their counts
  const protocolCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: tunnels.length,
      wireguard: 0,
      vless: 0,
      trojan: 0,
      vmess: 0,
      shadowsocks: 0,
    };
    tunnels.forEach((tun) => {
      if (counts[tun.protocol] !== undefined) {
        counts[tun.protocol]++;
      }
    });
    return counts;
  }, [tunnels]);

  // Filtered tunnels based on search and protocol pill
  const filteredTunnels = useMemo(() => {
    return tunnels.filter((tun) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        tun.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tun.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tun.protocol.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProtocol =
        selectedProtocol === 'all' || tun.protocol === selectedProtocol;

      return matchesSearch && matchesProtocol;
    });
  }, [tunnels, searchQuery, selectedProtocol]);

  // Quick Connect / Select Handler
  const handleSelectTunnel = useCallback(
    (id: string) => {
      const selected = tunnels.find((tun) => tun.id === id);
      setActiveTunnel(id);

      if (selected) {
        setFeedbackToast(`Active profile set to "${selected.name}"`);
        setTimeout(() => setFeedbackToast(null), 2500);
      }
    },
    [setActiveTunnel, tunnels]
  );

  // Delete Tunnel Handler
  const handleDeleteTunnel = useCallback(
    (id: string) => {
      const victim = tunnels.find((tun) => tun.id === id);
      removeTunnel(id);
      if (victim) {
        setFeedbackToast(`Deleted profile "${victim.name}"`);
        setTimeout(() => setFeedbackToast(null), 2500);
      }
    },
    [removeTunnel, tunnels]
  );

  // Edit Tunnel Handler
  const handleOpenEdit = useCallback((tunnel: TunnelItem) => {
    setEditingTunnel(tunnel);
    setEditName(tunnel.name);
    setEditEndpoint(tunnel.endpoint);
  }, []);

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTunnel || !editName.trim()) return;

    updateTunnel(editingTunnel.id, {
      name: editName.trim(),
      endpoint: editEndpoint.trim() || editingTunnel.endpoint,
    });

    setFeedbackToast(`Updated profile "${editName.trim()}"`);
    setTimeout(() => setFeedbackToast(null), 2500);
    setEditingTunnel(null);
  };

  // Load sample configs if empty
  const handleLoadSamples = () => {
    importSampleConfig();
    // Also inject sample configs into tunnel store
    const sampleWG = `[Interface]
PrivateKey = aGVsbG8td29ybGQtdGVzdC1rZXktZm9yLXVzZXItYWVnaXM=
Address = 10.14.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = c2FtcGxlLXdpcmVndWFyZC1wdWJsaWMta2V5LXZwbi10dW5uZWw=
Endpoint = frankfurt.edge.aegis-vpn.io:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

    const sampleVless = `vless://b831381d-6324-4d53-ad4f-8cda48b30811@amsterdam.edge.aegis-vpn.io:443?security=reality&type=tcp&sni=amsterdam.edge.aegis-vpn.io#Amsterdam-Reality-Edge`;
    const sampleTrojan = `trojan://securepass8899@tokyo.edge.aegis-vpn.io:443?security=tls&type=ws&sni=tokyo.edge.aegis-vpn.io#Tokyo-HighSpeed-Trojan`;

    useTunnelStore.getState().addTunnel(sampleWG);
    useTunnelStore.getState().addTunnel(sampleVless);
    useTunnelStore.getState().addTunnel(sampleTrojan);
  };

  // ==========================================================================
  // 1. EMPTY STATE BENTO ARCHITECTURE
  // ==========================================================================
  if (tunnels.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto py-6 sm:py-10">
        <div className="grid grid-cols-12 gap-4 md:gap-5">
          <BentoCard
            colSpan="col-span-12"
            className="p-8 sm:p-12 text-center relative overflow-hidden border-dashed border-2"
          >
            {/* Ambient Background Spotlight */}
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none opacity-15 blur-3xl bg-[var(--accent-primary)]"
              aria-hidden="true"
            />

            {/* Glowing Hologram Shield Icon */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-accent)',
                boxShadow: '0 0 32px var(--accent-glow)',
              }}
              className="relative mx-auto mb-6 w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border flex items-center justify-center"
            >
              <Layers
                className="w-10 h-10 sm:w-12 sm:h-12"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>

            {/* Header & Description */}
            <h2
              style={{ color: 'var(--text-primary)' }}
              className="text-xl sm:text-2xl font-bold tracking-tight mb-2"
            >
              {t('tunnels.emptyVault')}
            </h2>
            <p
              style={{ color: 'var(--text-secondary)' }}
              className="text-xs sm:text-sm leading-relaxed max-w-lg mx-auto mb-8"
            >
              {t('tunnels.emptyVaultDesc')}
            </p>

            {/* 2026 LiquidButton Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
              <LiquidButton
                id="btn-tunnels-empty-add"
                variant="primary"
                morphology="pill"
                size="lg"
                className="w-full sm:w-auto"
                icon={<FilePlus className="w-4 h-4" />}
                onClick={() => setIsImportModalOpen(true)}
              >
                {t('tunnels.newTunnel')}
              </LiquidButton>

              <LiquidButton
                id="btn-tunnels-empty-sample"
                variant="secondary"
                morphology="pill"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Sparkles className="w-4 h-4 text-blue-400" />}
                onClick={handleLoadSamples}
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
  // 2. POPULATED TUNNELS VIRTUALIZED / OPTIMIZED VIEW
  // ==========================================================================
  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 pb-12">
      {/* Toast Feedback Notification */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-accent)',
              color: 'var(--text-primary)',
              boxShadow: '0 8px 30px var(--glass-shadow)',
            }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full border backdrop-blur-xl text-xs font-medium"
          >
            <Check className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{feedbackToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          STICKY SEARCH & FILTER CONTROL BAR
          ==================================================================== */}
      <div
        id="servers-sticky-controls"
        style={{
          backgroundColor: 'var(--bg-canvas)',
        }}
        className="sticky top-0 z-30 pt-1 pb-3 backdrop-blur-3xl transition-colors space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input Bar */}
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              id="tunnel-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by profile name, IP, protocol..."
              style={{
                backgroundColor: 'var(--bg-surface-glass)',
                borderColor: 'var(--border-glass)',
                color: 'var(--text-primary)',
              }}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border text-xs font-medium outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons: Add Config */}
          <div className="flex items-center gap-2 shrink-0">
            <LiquidButton
              id="btn-tunnels-add-new"
              variant="primary"
              morphology="pill"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsImportModalOpen(true)}
            >
              {t('tunnels.newTunnel')}
            </LiquidButton>
          </div>
        </div>

        {/* Protocol Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
          {[
            { id: 'all', label: 'All Protocols', count: protocolCounts.all },
            { id: 'wireguard', label: 'WireGuard', count: protocolCounts.wireguard },
            { id: 'vless', label: 'VLESS', count: protocolCounts.vless },
            { id: 'trojan', label: 'Trojan', count: protocolCounts.trojan },
            { id: 'vmess', label: 'VMess', count: protocolCounts.vmess },
            { id: 'shadowsocks', label: 'Shadowsocks', count: protocolCounts.shadowsocks },
          ].map((item) => {
            const isSelected = selectedProtocol === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedProtocol(item.id)}
                style={{
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-surface-elevated)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  boxShadow: isSelected ? '0 0 14px var(--accent-glow)' : 'none',
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>{item.label}</span>
                <span
                  style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                  }}
                  className="text-[10px] font-mono px-1.5 py-0.2 rounded-full"
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Swipe Gesture Tip Banner on Mobile */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-glass)',
          borderColor: 'var(--border-glass)',
          color: 'var(--text-muted)',
        }}
        className="sm:hidden flex items-center justify-between px-3.5 py-2 rounded-xl border text-[11px] font-mono"
      >
        <span>Swipe right to Edit · Swipe left to Delete</span>
        <Filter className="w-3.5 h-3.5 opacity-60" />
      </div>

      {/* ====================================================================
          TUNNEL CARDS LIST
          ==================================================================== */}
      {filteredTunnels.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-surface-glass)',
            borderColor: 'var(--border-glass)',
            color: 'var(--text-secondary)',
          }}
          className="p-10 rounded-2xl border text-center my-6 space-y-3"
        >
          <Search className="w-8 h-8 mx-auto opacity-40 text-[var(--accent-primary)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            No configurations match your search criteria.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Try adjusting your search terms or filter selection.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedProtocol('all');
            }}
            className="text-xs font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filteredTunnels.map((tunnel) => {
              const isActive = tunnel.id === activeTunnelId;

              return (
                <motion.div
                  key={tunnel.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                >
                  <TunnelCard
                    tunnel={tunnel}
                    isActive={isActive}
                    onSelect={handleSelectTunnel}
                    onDelete={handleDeleteTunnel}
                    onEdit={handleOpenEdit}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ====================================================================
          MODALS: IMPORT & EDIT
          ==================================================================== */}
      {/* 1. Import Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* 2. Bento Edit Modal */}
      {editingTunnel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingTunnel(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-glass)',
              boxShadow: 'var(--glass-shadow)',
              color: 'var(--text-primary)',
            }}
            className="w-full max-w-md rounded-3xl border p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-glass)',
                    color: 'var(--accent-primary)',
                  }}
                  className="w-9 h-9 rounded-xl border flex items-center justify-center"
                >
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Edit Configuration</h3>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                    Protocol: {editingTunnel.protocol}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingTunnel(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-glass)',
                    color: 'var(--text-primary)',
                  }}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none focus:border-[var(--accent-primary)] transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-1">
                  Endpoint (Host / IP : Port)
                </label>
                <input
                  type="text"
                  value={editEndpoint}
                  onChange={(e) => setEditEndpoint(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-glass)',
                    color: 'var(--text-primary)',
                  }}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-[var(--accent-primary)] transition-all"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <LiquidButton
                  variant="ghost"
                  morphology="pill"
                  size="sm"
                  onClick={() => setEditingTunnel(null)}
                >
                  Cancel
                </LiquidButton>
                <LiquidButton
                  variant="primary"
                  morphology="pill"
                  size="sm"
                  type="submit"
                >
                  Save Changes
                </LiquidButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
