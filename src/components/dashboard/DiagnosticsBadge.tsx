import React, { useState } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw, Radio } from 'lucide-react';
import { runNetworkDiagnostics } from '../../utils/networkDiagnostics';
import type { DiagnosticsResult } from '../../types/singbox';

interface DiagnosticsBadgeProps {
  isConnected: boolean;
  className?: string;
}

export const DiagnosticsBadge: React.FC<DiagnosticsBadgeProps> = ({ isConnected, className = '' }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);

  const handleRunDiagnostics = async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const res = await runNetworkDiagnostics();
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        success: false,
        active: false,
        message: `Probe failed: ${msg}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        id="btn-run-diagnostics"
        onClick={handleRunDiagnostics}
        disabled={isRunning}
        title="Run network routing test through TUN interface"
        className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/15 hover:border-white/25 active:scale-95 shadow-sm"
      >
        <RefreshCw className={`w-3 h-3 text-blue-400 ${isRunning ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
        <span className="text-[11px] tracking-wide font-mono">
          {isRunning ? 'Probing TUN...' : 'Self-Test'}
        </span>
      </button>

      {/* Result Status Badge */}
      {result && (
        <div
          id="network-diagnostics-badge"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border transition-all duration-300 animate-in fade-in zoom-in-95 ${
            result.success
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
          }`}
          title={result.message}
        >
          {result.success ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
          )}
          <span className="truncate max-w-[140px] sm:max-w-none">
            {result.success ? 'Traffic Routing Active' : 'Routing Failed'}
          </span>
          {result.latencyMs !== undefined && (
            <span className="text-[9px] opacity-75 font-normal">
              ({result.latencyMs}ms)
            </span>
          )}
        </div>
      )}
    </div>
  );
};
