import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Clipboard,
  QrCode,
  Upload,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Camera,
  Shield,
  Layers,
  Globe,
  ImageIcon,
} from 'lucide-react';
import { useTunnelStore } from '../../store/useTunnelStore';
import { LiquidButton } from '../ui/LiquidButton';
import { useI18n } from '../../i18n/I18nContext';
import { fetchSubscription } from '../../utils/subscriptionFetcher';
import { SubscriptionDecoder } from '../../parsers/SubscriptionDecoder';

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (tunnelName: string) => void;
}

/**
 * ImportModal (Liquid Glass 2.0 Bento Modal)
 * 
 * Includes 3 distinct Liquid Buttons with micro-tactility:
 * 1. "Paste from Clipboard" (navigator.clipboard.readText)
 * 2. "Scan QR Code" (Scanner viewfinder overlay & Capacitor bridge)
 * 3. "Import File" (.conf / .json / .txt file reader)
 * 
 * Fully responsive and styled exclusively via CSS variables.
 */
export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useI18n();
  const addTunnel = useTunnelStore((state) => state.addTunnel);
  const addParsedTunnels = useTunnelStore((state) => state.addParsedTunnels);

  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isScanningQR, setIsScanningQR] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera stream teardown
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Reset modal state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsScanningQR(false);
      setCameraError(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  // Camera QR Scanner Lifecycle & BarcodeDetector Loop
  useEffect(() => {
    if (!isOpen || !isScanningQR) {
      stopCamera();
      return;
    }

    let active = true;
    let animFrame: number | null = null;

    const startCamera = async () => {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera device access is not supported in this environment.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Native BarcodeDetector (Supported in Chromium / modern Android WebView)
        if (typeof window !== 'undefined' && (window as any).BarcodeDetector) {
          try {
            const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            const scanFrame = async () => {
              if (!active || !videoRef.current) return;
              if (videoRef.current.readyState >= 2) {
                try {
                  const barcodes = await detector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    const scanned = barcodes[0].rawValue.trim();
                    if (scanned) {
                      stopCamera();
                      setIsScanningQR(false);
                      setRawText(scanned);
                      handleProcessImport(scanned);
                      return;
                    }
                  }
                } catch {}
              }
              if (active) {
                animFrame = requestAnimationFrame(scanFrame);
              }
            };
            animFrame = requestAnimationFrame(scanFrame);
          } catch {}
        }
      } catch (err: any) {
        if (active) {
          setCameraError(err?.message || 'Camera permission was denied or camera is unavailable.');
        }
      }
    };

    startCamera();

    return () => {
      active = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      stopCamera();
    };
  }, [isOpen, isScanningQR]);

  // Detect protocol type dynamically for syntax preview badge
  const detectedProtocol = (() => {
    const trimmed = rawText.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return 'Subscription URL';
    if (trimmed.includes('[Interface]') || trimmed.includes('[Peer]')) return 'WireGuard';
    if (trimmed.toLowerCase().startsWith('vless://')) return 'VLESS';
    if (trimmed.toLowerCase().startsWith('trojan://')) return 'Trojan';
    if (trimmed.toLowerCase().startsWith('vmess://')) return 'VMess';
    if (trimmed.toLowerCase().startsWith('ss://')) return 'Shadowsocks';
    return 'Custom / Raw';
  })();

  const handleProcessImport = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Please provide a config, URI, or subscription URL.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);

    try {
      // 1. Subscription URL Import Flow (http:// or https://)
      if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        setProcessingStatus('در حال دریافت اشتراک...');
        const fetchRes = await fetchSubscription(trimmed);

        if (!fetchRes.success || !fetchRes.content) {
          setError(fetchRes.error || 'Failed to fetch subscription from remote URL.');
          return;
        }

        setProcessingStatus('در حال پردازش نودها...');
        const decodeRes = SubscriptionDecoder.decodeAndParse(fetchRes.content);

        if (decodeRes.unsupportedMessage) {
          setError(decodeRes.unsupportedMessage);
          return;
        }

        if (!decodeRes.nodes || decodeRes.nodes.length === 0) {
          const firstErr = decodeRes.errors?.[0]?.error;
          setError(firstErr || 'No valid proxy nodes found in subscription.');
          return;
        }

        const addRes = addParsedTunnels(decodeRes.nodes);
        if (addRes.success && addRes.addedCount > 0) {
          const count = addRes.addedCount;
          setSuccessMsg(`${count} nodes imported`);
          setRawText('');
          if (onSuccess) onSuccess(`${count} nodes`);
          setTimeout(() => {
            onClose();
            setSuccessMsg(null);
          }, 1200);
        } else {
          setError(addRes.errors?.[0] || 'No valid nodes could be imported.');
        }
        return;
      }

      // 2. Direct single-node / raw config Import Flow
      setProcessingStatus(null);
      const res = addTunnel(trimmed);
      if (res.success && res.tunnel) {
        setSuccessMsg(`Tunnel "${res.tunnel.name}" imported successfully!`);
        setRawText('');
        if (onSuccess) onSuccess(res.tunnel.name);
        setTimeout(() => {
          onClose();
          setSuccessMsg(null);
        }, 1200);
      } else {
        // Fallback: check if multi-node raw plain / base64 / json was provided
        const detection = SubscriptionDecoder.detectFormat(trimmed);
        if (detection.format !== 'unknown' && detection.format !== 'clash-yaml') {
          const decodeRes = SubscriptionDecoder.decodeAndParse(trimmed);
          if (decodeRes.nodes && decodeRes.nodes.length > 0) {
            const addRes = addParsedTunnels(decodeRes.nodes);
            if (addRes.success && addRes.addedCount > 0) {
              setSuccessMsg(`${addRes.addedCount} nodes imported`);
              setRawText('');
              if (onSuccess) onSuccess(`${addRes.addedCount} nodes`);
              setTimeout(() => {
                onClose();
                setSuccessMsg(null);
              }, 1200);
              return;
            }
          }
        }
        setError(res.error || 'Failed to parse configuration');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during import.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  // 1. Action: Paste from Clipboard (Capacitor Native Bridge -> Web navigator fallback)
  const handlePasteClipboard = async () => {
    setError(null);
    try {
      let text = '';

      // Primary on mobile/Android: Capacitor Native Clipboard Plugin
      try {
        const { Clipboard: CapClipboard } = await import('@capacitor/clipboard');
        const res = await CapClipboard.read();
        if (res && typeof res.value === 'string') {
          text = res.value;
        }
      } catch (capErr) {
        console.warn('[ImportModal] Capacitor clipboard read not available:', capErr);
      }

      // Secondary fallback: Web standard navigator.clipboard.readText()
      if (!text && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (webErr: any) {
          if (!text) throw webErr;
        }
      }

      const trimmed = text.trim();
      if (!trimmed) {
        setError('Clipboard is empty.');
        return;
      }

      setRawText(trimmed);
      handleProcessImport(trimmed);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('permissions policy') || msg.includes('Permission denied')) {
        setError('Clipboard access was blocked by system permissions. Please paste directly into the text area below.');
      } else {
        setError(err?.message || 'Unable to read from clipboard. Please paste manually.');
      }
    }
  };

  // 2. Action: Import File (.conf / .json / .txt)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        handleProcessImport(content);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file from disk.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Action: Select QR Image from Device Gallery / Photos
  const handleQrImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (typeof window !== 'undefined' && (window as any).BarcodeDetector) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const scanned = barcodes[0].rawValue.trim();
          stopCamera();
          setIsScanningQR(false);
          setRawText(scanned);
          handleProcessImport(scanned);
          return;
        }
      }
      setError('No QR code detected in the selected image. Please paste the config text directly.');
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze QR image.');
    } finally {
      e.target.value = '';
    }
  };

  // 3. Action: Scan Sample QR (Strict 32-byte Base64 Reality public_key)
  const handleScanSampleQR = () => {
    // Valid 32-byte Base64 key: c2FtcGxlLTMyLWJ5dGUtcmVhbGl0eS1wdWJrZXkhISE= (decoded: 32 bytes)
    const sampleVless = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@lon.edge.aegis-vpn.io:443?security=reality&type=tcp&sni=lon.edge.aegis-vpn.io&pbk=c2FtcGxlLTMyLWJ5dGUtcmVhbGl0eS1wdWJrZXkhISE=&fp=chrome#London-HighSpeed-Reality';
    stopCamera();
    setIsScanningQR(false);
    setRawText(sampleVless);
    handleProcessImport(sampleVless);
  };

  if (!isOpen) return null;

  return (
    <div
      id="import-modal-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="import-modal-container"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-glass)',
          boxShadow: 'var(--glass-shadow)',
          color: 'var(--text-primary)',
        }}
        className="w-full max-w-xl rounded-3xl border p-5 sm:p-7 shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in zoom-in-95 duration-200"
      >
        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".conf,.json,.txt,text/plain"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Hidden native QR image file input */}
        <input
          ref={qrFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleQrImageSelect}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                borderColor: 'var(--border-glass)',
                color: 'var(--accent-primary)',
              }}
              className="w-10 h-10 rounded-2xl border flex items-center justify-center"
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Import Tunnel Configuration
              </h2>
              <p className="text-[11px] font-mono text-[var(--text-muted)]">
                Subscription URL · WireGuard · VLESS · Trojan · VMess · Shadowsocks
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1 font-mono text-[11px]">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1 font-mono text-[11px]">{successMsg}</span>
          </div>
        )}

        {/* QR Scanner Overlay Mode */}
        {isScanningQR ? (
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-glass)',
            }}
            className="p-6 rounded-2xl border text-center relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]"
          >
            {/* Camera Viewfinder Reticle */}
            <div className="relative w-56 h-56 rounded-2xl border-2 border-dashed border-[var(--accent-primary)] flex items-center justify-center overflow-hidden mb-3 bg-black/60 shadow-lg">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Camera className="w-12 h-12 text-[var(--accent-primary)] opacity-30 animate-pulse" />
              </div>
              {/* Animated Laser Scanner Line */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-primary)] animate-pulse pointer-events-none" />
            </div>

            {cameraError ? (
              <p className="text-xs font-mono text-rose-400 mb-4 px-3 max-w-sm">
                {cameraError}
              </p>
            ) : (
              <p className="text-xs font-mono text-[var(--text-secondary)] mb-4">
                Point camera at configuration QR code or choose a photo.
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <LiquidButton
                variant="purple"
                size="sm"
                morphology="pill"
                icon={<ImageIcon className="w-3.5 h-3.5 text-white" />}
                onClick={() => qrFileInputRef.current?.click()}
              >
                Choose Photo
              </LiquidButton>
              <LiquidButton
                variant="primary"
                size="sm"
                morphology="pill"
                onClick={handleScanSampleQR}
              >
                Scan Sample QR
              </LiquidButton>
              <LiquidButton
                variant="secondary"
                size="sm"
                morphology="pill"
                onClick={() => setIsScanningQR(false)}
              >
                Cancel
              </LiquidButton>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto space-y-4 pr-0.5 pb-8 sm:pb-4"
            style={{
              paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* 3 Distinct Liquid Buttons Bento Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Button 1: Paste Clipboard */}
              <LiquidButton
                id="btn-import-paste"
                variant="primary"
                morphology="ergonomic"
                size="md"
                className="w-full flex-col h-auto py-3 gap-1.5 justify-center text-center"
                icon={<Clipboard className="w-4 h-4 text-white" />}
                onClick={handlePasteClipboard}
              >
                <span className="text-xs font-semibold">Paste Clipboard</span>
                <span className="text-[10px] font-mono opacity-80 font-normal">Auto-Detect</span>
              </LiquidButton>

              {/* Button 2: Scan QR Code */}
              <LiquidButton
                id="btn-import-qr"
                variant="purple"
                morphology="ergonomic"
                size="md"
                className="w-full flex-col h-auto py-3 gap-1.5 justify-center text-center"
                icon={<QrCode className="w-4 h-4 text-white" />}
                onClick={() => setIsScanningQR(true)}
              >
                <span className="text-xs font-semibold">Scan QR Code</span>
                <span className="text-[10px] font-mono opacity-80 font-normal">Camera Lens</span>
              </LiquidButton>

              {/* Button 3: Import File */}
              <LiquidButton
                id="btn-import-file"
                variant="secondary"
                morphology="ergonomic"
                size="md"
                className="w-full flex-col h-auto py-3 gap-1.5 justify-center text-center"
                icon={<Upload className="w-4 h-4 text-emerald-400" />}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="text-xs font-semibold">Import File</span>
                <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">.conf / .json</span>
              </LiquidButton>
            </div>

            {/* Manual Config String / URI Input Container */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="tunnel-raw-input"
                  className="text-xs font-semibold tracking-wide uppercase text-[var(--text-secondary)] flex items-center gap-1.5"
                >
                  <FileCode className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  Direct Config / URI String
                </label>

                {detectedProtocol && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {detectedProtocol}
                  </span>
                )}
              </div>

              <textarea
                id="tunnel-raw-input"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste subscription URL (https://...), share link (vless://, trojan://...), or WireGuard [Interface] config..."
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-glass)',
                  color: 'var(--text-primary)',
                }}
                className="w-full p-3.5 rounded-2xl border text-xs font-mono outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all resize-none shadow-inner"
              />
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <LiquidButton
                variant="ghost"
                morphology="pill"
                size="md"
                onClick={onClose}
              >
                Cancel
              </LiquidButton>

              <LiquidButton
                id="btn-confirm-import"
                variant="primary"
                morphology="pill"
                size="md"
                disabled={!rawText.trim() || isProcessing}
                isLoading={isProcessing}
                onClick={() => handleProcessImport(rawText)}
              >
                {processingStatus ? processingStatus : 'Import Tunnel'}
              </LiquidButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
