import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Terminal,
  RefreshCw,
  Copy,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Send,
  Zap,
  Filter,
  Search,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorSingbox } from '../plugins/SingboxPlugin';
import { runNetworkDiagnostics, pingServerEndpoint } from '../utils/networkDiagnostics';
import { useAppStore } from '../store/useAppStore';
import { useTunnelStore } from '../store/useTunnelStore';

type SessionType = 'current' | 'last';
type LogLevel = 'all' | 'error' | 'state' | 'warn';

export const DiagnosticsPage: React.FC = () => {
  const [session, setSession] = useState<SessionType>('current');
  const [currentLogs, setCurrentLogs] = useState<string[]>([]);
  const [lastLogs, setLastLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Network Diagnostic State
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<{
    success?: boolean;
    latencyMs?: number;
    message?: string;
    timestamp?: number;
  } | null>(null);

  const connectionState = useAppStore((state) => state.connectionState);
  const activeTunnel = useTunnelStore((state) => state.activeTunnel);

  // Fetch persistent diagnostic buffers from native NullVpnService
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorSingbox.getDiagnosticLogs();
        setCurrentLogs(res.currentSession || []);
        setLastLogs(res.lastSession || []);
      } else {
        // Fallback for browser preview / development
        const simulatedCurrent = [
          `[${new Date().toISOString()}] [SERVICE_START] Null VPN web diagnostic sandbox initialized`,
          `[${new Date().toISOString()}] [STATE_CHANGE] Current connectionState: ${connectionState}`,
          activeTunnel
            ? `[${new Date().toISOString()}] [CORE_CONFIG] Active tunnel target: ${activeTunnel.protocol}://${activeTunnel.endpoint}`
            : `[${new Date().toISOString()}] [INFO] No active tunnel selected in store`,
          `[${new Date().toISOString()}] [TELEMETRY] Native libbox daemon status: READY`,
        ];
        setCurrentLogs(simulatedCurrent);
        setLastLogs([
          `[${new Date(Date.now() - 3600000).toISOString()}] [SERVICE_START] Previous session log buffer`,
          `[${new Date(Date.now() - 3590000).toISOString()}] [STOP_REQUEST_SOURCE] Clean service termination`,
        ]);
      }
    } catch (err) {
      console.warn('[DiagnosticsPage] Failed to fetch logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectionState, activeTunnel]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // Clear logs handler
  const handleClearLogs = async () => {
    if (Capacitor.isNativePlatform()) {
      await CapacitorSingbox.clearDiagnosticLogs();
    }
    setCurrentLogs([]);
    setLastLogs([]);
  };

  // Run real-time routing probe & TCP ping
  const handleRunProbe = async () => {
    setIsProbing(true);
    try {
      if (activeTunnel?.endpoint) {
        const pingMs = await pingServerEndpoint(activeTunnel.endpoint);
        const diag = await runNetworkDiagnostics();
        setProbeResult({
          success: pingMs >= 0 || diag.success,
          latencyMs: pingMs >= 0 ? pingMs : diag.latencyMs,
          message:
            pingMs >= 0
              ? `Endpoint reachable: ${pingMs}ms RTT`
              : diag.message || 'Probe completed',
          timestamp: Date.now(),
        });
      } else {
        const diag = await runNetworkDiagnostics();
        setProbeResult({
          success: diag.success,
          latencyMs: diag.latencyMs,
          message: diag.message || (diag.success ? 'Routing active' : 'Unreachable'),
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      setProbeResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network probe failed',
        timestamp: Date.now(),
      });
    } finally {
      setIsProbing(false);
    }
  };

  // Filter logs by selected level and search query
  const displayedLogs = useMemo(() => {
    const rawList = session === 'current' ? currentLogs : lastLogs;
    return rawList.filter((line) => {
      // Level filter
      if (filterLevel === 'error') {
        if (!line.includes('[CORE_ERROR]') && !line.includes('ERROR') && !line.includes('FAIL')) {
          return false;
        }
      } else if (filterLevel === 'state') {
        if (!line.includes('STATE') && !line.includes('SERVICE_START') && !line.includes('CORE_START') && !line.includes('STOP')) {
          return false;
        }
      } else if (filterLevel === 'warn') {
        if (!line.includes('WARN') && !line.includes('ALERT')) {
          return false;
        }
      }

      // Query filter
      if (searchQuery.trim()) {
        return line.toLowerCase().includes(searchQuery.toLowerCase());
      }

      return true;
    });
  }, [session, currentLogs, lastLogs, filterLevel, searchQuery]);

  // Copy to clipboard
  const handleCopy = () => {
    const content = displayedLogs.join('\n');
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export as text file
  const handleExport = () => {
    const content = displayedLogs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `null_vpn_${session}_session_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      {/* 1. Header & Live Probe Control Panel */}
      <div
        className="glass-card p-5 sm:p-6"
        style={{
          backgroundColor: 'var(--bg-surface-glass)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                System Diagnostics & Core Telemetry
              </h2>
            </div>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              Inspect native VpnService lifecycle buffers, libbox runtime events, and live tunnel routing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunProbe}
              disabled={isProbing}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-foreground)',
              }}
            >
              <Zap className={`w-4 h-4 ${isProbing ? 'animate-spin' : ''}`} />
              {isProbing ? 'Probing...' : 'Test Network & Ping'}
            </button>

            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              title="Refresh Logs"
              className="p-2 rounded-xl border transition-all"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Network Probe Result Card */}
        {probeResult && (
          <div
            className="mt-4 p-3.5 rounded-xl border flex items-center justify-between transition-all"
            style={{
              backgroundColor: probeResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              borderColor: probeResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            }}
          >
            <div className="flex items-center gap-2.5">
              {probeResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <div>
                <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {probeResult.message}
                </span>
                {probeResult.latencyMs !== undefined && probeResult.latencyMs >= 0 && (
                  <span className="ms-2 text-xs font-mono font-bold text-emerald-400">
                    {probeResult.latencyMs} ms
                  </span>
                )}
              </div>
            </div>
            <span className="text-[11px] text-gray-500 font-mono">
              {new Date(probeResult.timestamp || Date.now()).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* 2. Session Switcher & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Session Switcher */}
        <div
          className="inline-flex p-1 rounded-xl border shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-glass)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setSession('current')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              session === 'current' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              backgroundColor: session === 'current' ? 'var(--accent-primary)' : 'transparent',
              color: session === 'current' ? 'var(--accent-foreground)' : 'var(--text-primary)',
            }}
          >
            Current Session ({currentLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setSession('last')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              session === 'last' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              backgroundColor: session === 'last' ? 'var(--accent-primary)' : 'transparent',
              color: session === 'last' ? 'var(--accent-foreground)' : 'var(--text-primary)',
            }}
          >
            Previous Session ({lastLogs.length})
          </button>
        </div>

        {/* Action Buttons: Copy, Export, Clear */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            className="px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all hover:border-rose-500/50 hover:text-rose-400"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* 3. Search & Level Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search diagnostic events (e.g. CORE_START, protect, error)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-mono transition-all outline-none"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'error', 'state', 'warn'] as LogLevel[]).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all border ${
                filterLevel === lvl ? 'border-indigo-500' : 'border-transparent'
              }`}
              style={{
                backgroundColor:
                  filterLevel === lvl
                    ? 'var(--accent-primary)'
                    : 'var(--bg-surface-elevated)',
                color:
                  filterLevel === lvl
                    ? 'var(--accent-foreground)'
                    : 'var(--text-muted)',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Terminal Log Console Output */}
      <div
        className="rounded-2xl border overflow-hidden shadow-2xl flex flex-col"
        style={{
          backgroundColor: '#0a0d14',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Terminal Titlebar */}
        <div className="px-4 py-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            <span className="text-[11px] font-mono text-gray-400 ms-2">
              sing-box-lx v1.14.1-lx.8 • {session === 'current' ? 'Active Session' : 'Persisted Last Session'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Secrets Scrubbed
          </div>
        </div>

        {/* Log Viewer Lines */}
        <div
          dir="ltr"
          className="p-4 overflow-y-auto max-h-[480px] font-mono text-xs leading-relaxed space-y-1 select-text scrollbar-thin"
        >
          {displayedLogs.length === 0 ? (
            <div className="py-12 text-center text-gray-600 font-sans text-sm">
              No diagnostic records found matching current criteria.
            </div>
          ) : (
            displayedLogs.map((log, idx) => {
              const isError = log.includes('ERROR') || log.includes('FAIL');
              const isWarn = log.includes('WARN');
              const isState = log.includes('STATE') || log.includes('SERVICE_START') || log.includes('CORE_START');

              return (
                <div
                  key={idx}
                  className={`py-0.5 px-2 rounded transition-colors ${
                    isError
                      ? 'bg-red-950/40 text-red-300 border-l-2 border-red-500'
                      : isWarn
                      ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                      : isState
                      ? 'text-cyan-300'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500 text-[10px] me-2 select-none">
                    {(idx + 1).toString().padStart(3, '0')}
                  </span>
                  <span>{log}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
