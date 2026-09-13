/**
 * Unified Cross-Platform VPN Engine Hook (src/hooks/useVpnEngine.ts)
 * 
 * Abstracted React hook providing a seamless interface to the underlying VPN daemon.
 * Dynamically resolves the runtime environment:
 * 
 * 1. Mobile (Android / iOS):
 *    -> Interfaces via `@capacitor/core` with `CapacitorSingbox` native plugin,
 *       binding to Android VpnService & iOS NetworkExtension.
 * 
 * 2. Desktop (macOS / Windows / Linux):
 *    -> Interfaces via Electron Context Bridge (`window.vpnEngine` IPC).
 * 
 * 3. Browser Preview / Development:
 *    -> Graceful simulation fallback with realistic latency and telemetry.
 * 
 * Both pathways map to the exact same Zustand store updates (connectionState,
 * engineError, stats, telemetry) with zero platform leaks into UI components.
 */

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { useAppStore } from '../store/useAppStore';
import { CapacitorSingbox } from '../plugins/SingboxPlugin';
import type {
  SingBoxConfigInput,
  SingBoxConfigObject,
  VpnTelemetryPayload,
  VpnStatusPayload,
} from '../types/singbox';
import type { WireguardTunnelConfig } from '../types/vpn';

export type PlatformTarget = 'mobile' | 'electron' | 'web';

/**
 * Builds a universal sing-box proxy configuration object from a WireGuard tunnel model.
 */
export function buildSingBoxConfigFromWireguard(tunnel: WireguardTunnelConfig): SingBoxConfigObject {
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
 * Formats elapsed seconds to hh:mm:ss string
 */
function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export function useVpnEngine() {
  const connectionState = useAppStore((state) => state.connectionState);
  const engineError = useAppStore((state) => state.engineError);
  const isAppActive = useAppStore((state) => state.isAppActive);
  const setConnectionState = useAppStore((state) => state.setConnectionState);
  const setEngineError = useAppStore((state) => state.setEngineError);
  const updateStats = useAppStore((state) => state.updateStats);
  const stats = useAppStore((state) => state.stats);
  const activeConfigId = useAppStore((state) => state.activeConfigId);
  const configs = useAppStore((state) => state.configs);

  // Fallback web simulation interval ref
  const webSimTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect execution runtime
  const platform = useMemo<PlatformTarget>(() => {
    if (Capacitor.isNativePlatform()) {
      return 'mobile';
    }
    if (typeof window !== 'undefined' && Boolean(window.vpnEngine)) {
      return 'electron';
    }
    return 'web';
  }, []);

  const activeConfig = useMemo(() => {
    return configs.find((c) => c.id === activeConfigId) || configs[0] || null;
  }, [configs, activeConfigId]);

  // ==========================================================================
  // UNIFIED TELEMETRY & STATE SUBSCRIPTIONS
  // ==========================================================================
  useEffect(() => {
    let isSubscribed = true;

    // PATHWAY 1: Mobile (Capacitor Native Plugin via Android VpnService / iOS NetworkExtension)
    if (platform === 'mobile') {
      let stateHandle: PluginListenerHandle | null = null;
      let telemetryHandle: PluginListenerHandle | null = null;

      const setupMobileListeners = async () => {
        try {
          // Listen to native tunnel lifecycle state changes
          stateHandle = await CapacitorSingbox.addListener('onStateChange', (payload: VpnStatusPayload) => {
            if (!isSubscribed) return;
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
                setEngineError(payload.message || 'Mobile VPN engine error occurred');
                break;
            }
          });

          // Listen to native telemetry stream (only active when UI is in foreground)
          telemetryHandle = await CapacitorSingbox.addListener('onTelemetry', (telemetry: VpnTelemetryPayload) => {
            if (!isSubscribed || !isAppActive) return;

            updateStats({
              downloadSpeed: telemetry.downloadSpeed,
              uploadSpeed: telemetry.uploadSpeed,
              totalReceived: telemetry.totalReceived,
              totalSent: telemetry.totalSent,
              latencyPing: telemetry.latencyPing,
              lastHandshake: telemetry.lastHandshake ?? 0,
              sessionUptime:
                telemetry.uptimeSeconds !== undefined
                  ? formatUptime(telemetry.uptimeSeconds)
                  : stats.sessionUptime,
            });
          });
        } catch (err) {
          console.warn('[SingboxPlugin] Failed to register mobile event listeners:', err);
        }
      };

      setupMobileListeners();

      return () => {
        isSubscribed = false;
        if (stateHandle) stateHandle.remove();
        if (telemetryHandle) telemetryHandle.remove();
      };
    }

    // PATHWAY 2: Desktop (Electron IPC via sing-box supervisor daemon)
    if (platform === 'electron' && window.vpnEngine) {
      const unsubscribeStatus = window.vpnEngine.onStatusChange((payload: VpnStatusPayload) => {
        if (!isSubscribed) return;
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
            setEngineError(payload.message || 'Desktop tunnel error occurred');
            break;
        }
      });

      const unsubscribeTelemetry = window.vpnEngine.onTelemetryUpdate((telemetry: VpnTelemetryPayload) => {
        if (!isSubscribed || !isAppActive) return;

        updateStats({
          downloadSpeed: telemetry.downloadSpeed,
          uploadSpeed: telemetry.uploadSpeed,
          totalReceived: telemetry.totalReceived,
          totalSent: telemetry.totalSent,
          latencyPing: telemetry.latencyPing,
          lastHandshake: telemetry.lastHandshake ?? 0,
          sessionUptime:
            telemetry.uptimeSeconds !== undefined
              ? formatUptime(telemetry.uptimeSeconds)
              : stats.sessionUptime,
        });
      });

      return () => {
        isSubscribed = false;
        unsubscribeStatus();
        unsubscribeTelemetry();
      };
    }

    return () => {
      isSubscribed = false;
    };
  }, [platform, isAppActive, setConnectionState, setEngineError, updateStats, stats.sessionUptime]);

  // Clean up any web simulation timer when connection drops
  useEffect(() => {
    if (connectionState !== 'connected' && webSimTimerRef.current) {
      clearInterval(webSimTimerRef.current);
      webSimTimerRef.current = null;
    }
  }, [connectionState]);

  // ==========================================================================
  // UNIFIED CONNECT DISPATCHER
  // ==========================================================================
  const connect = useCallback(
    async (customConfig?: SingBoxConfigInput): Promise<boolean> => {
      setEngineError(null);
      setConnectionState('connecting');

      // Resolve tunnel configuration
      let finalConfigObj: SingBoxConfigObject | null = null;
      let finalConfigStr: string;

      if (customConfig) {
        if (typeof customConfig === 'string') {
          finalConfigStr = customConfig;
          try {
            finalConfigObj = JSON.parse(customConfig);
          } catch {
            // Keep as string
          }
        } else {
          finalConfigObj = customConfig;
          finalConfigStr = JSON.stringify(customConfig, null, 2);
        }
      } else if (activeConfig) {
        finalConfigObj = buildSingBoxConfigFromWireguard(activeConfig);
        finalConfigStr = JSON.stringify(finalConfigObj, null, 2);
      } else {
        const err = 'No active VPN configuration selected to launch sing-box';
        setEngineError(err);
        setConnectionState('disconnected');
        return false;
      }

      // 1. Mobile Pathway (Capacitor Native Plugin)
      if (platform === 'mobile') {
        try {
          const result = await CapacitorSingbox.startEngine({ config: finalConfigStr });
          if (!result.success) {
            const errorMsg = result.error || 'Failed to initialize OS VPN Service';
            setEngineError(errorMsg);
            setConnectionState('disconnected');
            return false;
          }
          return true;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'CapacitorSingbox.startEngine failed';
          setEngineError(errorMsg);
          setConnectionState('disconnected');
          return false;
        }
      }

      // 2. Desktop Pathway (Electron IPC Bridge)
      if (platform === 'electron' && window.vpnEngine) {
        try {
          const result = await window.vpnEngine.start(finalConfigObj || finalConfigStr);
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

      // 3. Web Preview Pathway (Graceful browser simulation)
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          setConnectionState('connected');
          const startTimestamp = Date.now();
          let secCount = 0;

          updateStats({
            downloadSpeed: 118.5 * 1024 * 1024,
            uploadSpeed: 38.2 * 1024 * 1024,
            totalReceived: 85.4 * 1024 * 1024,
            totalSent: 22.1 * 1024 * 1024,
            latencyPing: 26,
            lastHandshake: 1,
            sessionUptime: '00:00:01',
            connectedSince: startTimestamp,
          });

          if (webSimTimerRef.current) {
            clearInterval(webSimTimerRef.current);
          }

          webSimTimerRef.current = setInterval(() => {
            // Respect app foreground state: pause simulation updates in background
            if (!useAppStore.getState().isAppActive) return;

            secCount += 1;
            const variance = (Math.random() - 0.5) * 4 * 1024 * 1024;
            updateStats({
              downloadSpeed: Math.max(10 * 1024 * 1024, 118.5 * 1024 * 1024 + variance),
              uploadSpeed: Math.max(5 * 1024 * 1024, 38.2 * 1024 * 1024 + variance * 0.4),
              latencyPing: Math.floor(24 + Math.random() * 6),
              sessionUptime: formatUptime(secCount),
            });
          }, 1000);

          resolve(true);
        }, 600);
      });
    },
    [platform, activeConfig, setConnectionState, setEngineError, updateStats]
  );

  // ==========================================================================
  // UNIFIED DISCONNECT DISPATCHER
  // ==========================================================================
  const disconnect = useCallback(async (): Promise<boolean> => {
    setEngineError(null);

    // Stop web simulation timer if active
    if (webSimTimerRef.current) {
      clearInterval(webSimTimerRef.current);
      webSimTimerRef.current = null;
    }

    // 1. Mobile Pathway
    if (platform === 'mobile') {
      try {
        const result = await CapacitorSingbox.stopEngine();
        setConnectionState('disconnected');
        return result.success;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'CapacitorSingbox.stopEngine failed';
        setEngineError(errorMsg);
        setConnectionState('disconnected');
        return false;
      }
    }

    // 2. Desktop Pathway
    if (platform === 'electron' && window.vpnEngine) {
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

    // 3. Web Preview Pathway
    setConnectionState('disconnected');
    updateStats({
      downloadSpeed: 0,
      uploadSpeed: 0,
      connectedSince: null,
    });
    return true;
  }, [platform, setConnectionState, setEngineError, updateStats]);

  /**
   * Unified Toggle
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
    platform,
    isMobile: platform === 'mobile',
    isElectron: platform === 'electron',
    isWeb: platform === 'web',
    stats,
    activeConfig,
  };
}
