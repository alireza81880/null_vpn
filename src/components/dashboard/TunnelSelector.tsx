import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, ChevronDown, Check, Globe, Shield, Plus, Sparkles } from 'lucide-react';
import { useAppStore, useActiveConfig } from '../../store/useAppStore';
import { useTunnelStore, useActiveTunnel } from '../../store/useTunnelStore';
import { useVpnEngine } from '../../hooks/useVpnEngine';
import { useI18n } from '../../i18n/I18nContext';

export interface TunnelSelectorProps {
  onOpenImportModal: () => void;
}

export const TunnelSelector: React.FC<TunnelSelectorProps> = React.memo(({ onOpenImportModal }) => {
  const configs = useAppStore((state) => state.configs);
  const activeConfigId = useAppStore((state) => state.activeConfigId);
  const setActiveConfigId = useAppStore((state) => state.setActiveConfigId);
  const connectionState = useAppStore((state) => state.connectionState);

  const tunnels = useTunnelStore((state) => state.tunnels);
  const activeTunnelId = useTunnelStore((state) => state.activeTunnelId);
  const setActiveTunnel = useTunnelStore((state) => state.setActiveTunnel);

  const activeTunnel = useActiveTunnel();
  const activeConfig = useActiveConfig();
  const { switchTunnel } = useVpnEngine();

  const { t, isRTL } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeName =
    activeTunnel?.name ||
    activeConfig?.name ||
    tunnels.find((t) => t.id === activeTunnelId)?.name ||
    configs.find((c) => c.id === activeConfigId)?.name ||
    tunnels[0]?.name ||
    configs[0]?.name ||
    t('dashboard.noTunnelSelected');

  const activeEndpoint =
    activeTunnel?.endpoint ||
    activeConfig?.endpoint ||
    tunnels.find((t) => t.id === activeTunnelId)?.endpoint ||
    configs.find((c) => c.id === activeConfigId)?.endpoint ||
    tunnels[0]?.endpoint ||
    configs[0]?.endpoint ||
    '';

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  const items = tunnels.length > 0
    ? tunnels.map((t) => ({ id: t.id, name: t.name, endpoint: t.endpoint }))
    : configs.map((c) => ({ id: c.id, name: c.name, endpoint: c.endpoint }));

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative w-full max-w-md mx-auto my-2">
      {/* Selector Trigger Button */}
      <button
        id="btn-tunnel-selector"
        type="button"
        disabled={isConnecting}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-xl glass-card border transition-all text-start cursor-pointer hover:border-[var(--border-accent)]"
        style={{
          background: 'var(--bg-surface-glass)',
          borderColor: isOpen ? 'var(--border-accent)' : 'var(--border-glass)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: isConnected
                ? 'var(--status-connected-glow)'
                : 'rgba(255, 255, 255, 0.05)',
              color: isConnected ? 'var(--status-connected)' : 'var(--accent-primary)',
            }}
          >
            <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {t('dashboard.activeTunnel')}
            </span>
            <span
              className="text-sm font-bold truncate w-full overflow-hidden"
              style={{ color: 'var(--text-primary)' }}
              title={activeName}
            >
              {activeName}
            </span>
            {activeEndpoint && (
              <span className="text-[11px] font-mono truncate w-full overflow-hidden" style={{ color: 'var(--text-secondary)' }}>
                {activeEndpoint}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full inset-x-0 mt-2 z-50 rounded-xl glass-panel-elevated border shadow-2xl overflow-hidden py-1"
            style={{
              background: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="max-h-60 overflow-y-auto px-1.5 py-1 space-y-1">
              {items.map((config) => {
                const isSelected =
                  config.id === activeTunnelId ||
                  config.id === activeConfigId ||
                  config.name === activeName;
                return (
                  <button
                    key={config.id}
                    id={`tunnel-option-${config.id}`}
                    type="button"
                    onClick={async () => {
                      setIsOpen(false);
                      await switchTunnel(config.id);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-start transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--bg-surface-hover)] border border-[var(--border-accent)]'
                        : 'hover:bg-[var(--bg-surface-hover)] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe
                        className="w-4 h-4 shrink-0"
                        style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {config.name}
                        </span>
                        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                          {config.endpoint}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--status-connected)' }}>
                        <span>{t('common.inUse')}</span>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Action in Dropdown Footer */}
            <div
              className="mt-1 pt-1 border-t px-2 py-1.5 flex items-center justify-between"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                id="btn-dropdown-import"
                onClick={() => {
                  setIsOpen(false);
                  onOpenImportModal();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: 'var(--accent-primary)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('tunnels.newTunnel')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

TunnelSelector.displayName = 'TunnelSelector';
