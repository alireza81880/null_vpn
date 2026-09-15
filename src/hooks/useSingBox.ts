import { useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useTunnelStore } from '../store/useTunnelStore';
import { buildUniversalSingBoxConfig, validateSingBoxConfig } from '../utils/singboxConfig';
import type {
  SingBoxConfigInput,
  SingBoxConfigObject,
  VpnTelemetryPayload,
  VpnStatusPayload,
} from '../types/singbox';
import type { WireguardTunnelConfig } from '../types/vpn';

/**
 * Converts a WireGuard tunnel config into a compliant sing-box universal proxy configuration.
 */
function buildSingBoxConfigFromWireguard(tunnel: WireguardTunnelConfig): SingBoxConfigObject {
  return buildUniversalSingBoxConfig(tunnel, { isMobile: false });
}

/**
 * Custom React Hook: useSingBox
 * 
 * Bridges the React UI to the Electron IPC sing-box daemon manager.
 * Securely manages lifecycle execution, status transitions, real-time telemetry streaming,
 * and error routing into the global Zustand store.
 */
export function useSingBox() {
  const connectionState = useAppStore((state) => state.connectionState);
  const engineError = useAppStore((state) => state.engineError);
  const setConnectionState = useAppStore((state) => state.setConnectionState);
  const setEngineError = useAppStore((state) => state.setEngineError);
  const updateStats = useAppStore((state) => state.updateStats);
  const stats = useAppStore((state) => state.stats);
  const activeConfigId = useAppStore((state) => state.activeConfigId);
  const configs = useAppStore((state) => state.configs);

  const isElectron = useMemo(() => {
    return typeof window !== 'undefined' && Boolean(window.vpnEngine);
  }, []);

  const activeConfig = useMemo(() => {
    return configs.find((c) => c.id === activeConfigId) || configs[0] || null;
  }, [configs, activeConfigId]);

  // Subscribe to Electron IPC Daemon Events
  useEffect(() => {
    if (typeof window === 'undefined' || !window.vpnEngine) {
      return;
    }

    // 1. Connection Status Listener
    const unsubscribeStatus = window.vpnEngine.onStatusChange((payload: VpnStatusPayload) => {
      switch (payload.status) {
        case 'connecting':
          setConnectionState('connecting');
          break;
        case 'connected':
          setConnectionState('connected');
          setEngineError(null);
          break;
        case 'disconnected':
          setConnectionState('disconnected');
          break;
        case 'error':
          setConnectionState('disconnected');
          setEngineError(payload.message || 'Tunnel communication error occurred');
          break;
      }
    });

    // 2. Real-time Telemetry Listener
    const unsubscribeTelemetry = window.vpnEngine.onTelemetryUpdate((telemetry: VpnTelemetryPayload) => {
      const formatUptime = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
      };

      updateStats({
        downloadSpeed: telemetry.downloadSpeed,
        uploadSpeed: telemetry.uploadSpeed,
        totalReceived: telemetry.totalReceived,
        totalSent: telemetry.totalSent,
        latencyPing: telemetry.latencyPing,
        lastHandshake: telemetry.lastHandshake ?? 0,
        sessionUptime: telemetry.uptimeSeconds !== undefined ? formatUptime(telemetry.uptimeSeconds) : stats.sessionUptime,
      });
    });

    return () => {
      unsubscribeStatus();
      unsubscribeTelemetry();
    };
  }, [setConnectionState, setEngineError, updateStats, stats.sessionUptime]);

  /**
   * Connect to sing-box proxy engine
   */
  const connect = useCallback(
    async (customConfig?: SingBoxConfigInput): Promise<boolean> => {
      setEngineError(null);
      setConnectionState('connecting');

      // Determine configuration payload
      let finalConfig: SingBoxConfigInput;
      if (customConfig) {
        finalConfig = customConfig;
      } else {
        const selectedTunnel = useTunnelStore.getState().getActiveTunnel() || activeConfig;
        if (!selectedTunnel) {
          const err = 'No active VPN configuration selected to launch sing-box';
          setEngineError(err);
          setConnectionState('disconnected');
          return false;
        }
        finalConfig = buildUniversalSingBoxConfig(selectedTunnel, { isMobile: false });
      }

      // Strict Validation
      const validation = validateSingBoxConfig(finalConfig);
      if (!validation.valid) {
        const err = validation.error || 'Invalid sing-box configuration payload';
        setEngineError(err);
        setConnectionState('disconnected');
        return false;
      }

      // 1. Production Electron Environment
      if (typeof window !== 'undefined' && window.vpnEngine) {
        try {
          const result = await window.vpnEngine.start(finalConfig);
          if (!result.success) {
            const errorMsg = result.error || 'Failed to start sing-box proxy engine';
            setEngineError(errorMsg);
            setConnectionState('disconnected');
            return false;
          }
          return true;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'IPC call to vpnEngine.start failed';
          setEngineError(errorMsg);
          setConnectionState('disconnected');
          return false;
        }
      }

      // 2. Web Browser Preview Fallback (Graceful UI state transition, no fake throughput)
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          setConnectionState('connected');
          updateStats({
            downloadSpeed: 0,
            uploadSpeed: 0,
            totalReceived: 0,
            totalSent: 0,
            latencyPing: 0,
            lastHandshake: 0,
            sessionUptime: '00:00:00',
            connectedSince: Date.now(),
          });
          resolve(true);
        }, 400);
      });
    },
    [activeConfig, setConnectionState, setEngineError, updateStats]
  );

  /**
   * Disconnect from sing-box proxy engine
   */
  const disconnect = useCallback(async (): Promise<boolean> => {
    setEngineError(null);

    if (typeof window !== 'undefined' && window.vpnEngine) {
      try {
        const result = await window.vpnEngine.stop();
        setConnectionState('disconnected');
        return result.success;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'IPC call to vpnEngine.stop failed';
        setEngineError(errorMsg);
        setConnectionState('disconnected');
        return false;
      }
    }

    // Web Browser Preview Fallback
    setConnectionState('disconnected');
    updateStats({
      downloadSpeed: 0,
      uploadSpeed: 0,
      connectedSince: null,
    });
    return true;
  }, [setConnectionState, setEngineError, updateStats]);

  /**
   * Toggles the connection between connected and disconnected
   */
  const toggle = useCallback(async () => {
    if (connectionState === 'connected' || connectionState === 'connecting') {
      await disconnect();
    } else {
      await connect();
    }
  }, [connectionState, connect, disconnect]);

  const clearError = useCallback(() => {
    setEngineError(null);
  }, [setEngineError]);

  return {
    connect,
    disconnect,
    toggle,
    connectionState,
    error: engineError,
    clearError,
    isElectron,
    stats,
    activeConfig,
  };
}
