import { useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
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
  const [endpointHost, endpointPortStr] = tunnel.endpoint.split(':');
  const serverPort = endpointPortStr ? parseInt(endpointPortStr, 10) : 51820;

  return {
    log: {
      disabled: false,
      level: 'info',
      timestamp: true,
    },
    dns: {
      servers: [
        {
          tag: 'dns-remote',
          address: tunnel.interface?.dns || '1.1.1.1',
          detour: 'proxy-out',
        },
      ],
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'null-vpn0',
        inet4_address: '172.19.0.1/30',
        auto_route: true,
        strict_route: true,
        stack: 'system',
        sniff: true,
      },
    ],
    outbounds: [
      {
        type: 'wireguard',
        tag: 'proxy-out',
        server: endpointHost || '127.0.0.1',
        server_port: isNaN(serverPort) ? 51820 : serverPort,
        local_address: tunnel.interface?.address ? [tunnel.interface.address] : ['10.14.0.2/32'],
        private_key: tunnel.interface?.privateKey || '',
        peer_public_key: tunnel.peer?.publicKey || '',
        system_interface: false,
      },
      {
        type: 'direct',
        tag: 'direct',
      },
      {
        type: 'block',
        tag: 'block',
      },
    ],
    route: {
      rules: [
        {
          ip_is_private: true,
          outbound: 'direct',
        },
        {
          outbound: 'proxy-out',
        },
      ],
      auto_detect_interface: true,
    },
  };
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
      } else if (activeConfig) {
        finalConfig = buildSingBoxConfigFromWireguard(activeConfig);
      } else {
        const err = 'No active VPN configuration selected to launch sing-box';
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
