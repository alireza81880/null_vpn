import React, { useState, useRef } from 'react';
import { Shield, Upload, FileText, X, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useI18n } from '../../i18n/I18nContext';

interface ImportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportConfigModal: React.FC<ImportConfigModalProps> = ({ isOpen, onClose }) => {
  const addConfig = useAppStore((state) => state.addConfig);
  const { t, isRTL } = useI18n();

  const [tunnelName, setTunnelName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [rawConfig, setRawConfig] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle .conf file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setTunnelName(baseName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawConfig(text);

      // Simple WireGuard regex parser
      const endpointMatch = text.match(/Endpoint\s*=\s*([^\s\r\n]+)/i);
      if (endpointMatch && endpointMatch[1]) {
        setEndpoint(endpointMatch[1]);
      }
    };
    reader.readAsText(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tunnelName.trim() || !endpoint.trim()) {
      setError(t('modal.validationError'));
      return;
    }

    addConfig({
      name: tunnelName.trim(),
      endpoint: endpoint.trim(),
      rawConfig: rawConfig.trim(),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-lg glass-panel-elevated rounded-2xl overflow-hidden shadow-2xl transition-all max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-foreground)',
              }}
            >
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('modal.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-75 transition-opacity cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form
          onSubmit={handleSave}
          className="p-6 space-y-4 text-start overflow-y-auto flex-1 pb-8"
          style={{
            paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-xs font-medium border"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'var(--status-error)',
                color: 'var(--status-error)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick File Drag/Picker Box */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".conf,text/plain"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer hover:border-[var(--accent-primary)] hover:bg-[var(--bg-surface-hover)]"
              style={{
                borderColor: 'var(--border-glass)',
                backgroundColor: 'var(--bg-input)',
              }}
            >
              <Upload className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('common.chooseConfFile')}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('common.dragDropHint')}
              </span>
            </button>
          </div>

          {/* Tunnel Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('modal.tunnelName')} *
            </label>
            <input
              type="text"
              required
              value={tunnelName}
              onChange={(e) => setTunnelName(e.target.value)}
              placeholder={t('modal.tunnelNamePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl text-xs outline-none border transition-colors focus:border-[var(--accent-primary)]"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Endpoint */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('modal.endpoint')} *
            </label>
            <input
              type="text"
              required
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={t('modal.endpointPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono outline-none border transition-colors focus:border-[var(--accent-primary)]"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Raw Configuration Text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('modal.rawConfig')}
              </label>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {t('common.optional')}
              </span>
            </div>
            <textarea
              rows={4}
              value={rawConfig}
              onChange={(e) => setRawConfig(e.target.value)}
              placeholder={t('modal.rawConfigPlaceholder')}
              className="w-full px-3.5 py-2 rounded-xl text-xs font-mono outline-none border transition-colors focus:border-[var(--accent-primary)] resize-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Footer Actions */}
          <div
            className="pt-3 border-t flex items-center justify-end gap-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-md hover:opacity-95"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-foreground)',
              }}
            >
              {t('modal.saveAndSelect')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
