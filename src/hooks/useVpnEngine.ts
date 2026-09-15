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
import { useTunnelStore } from '../store/useTunnelStore';
import { CapacitorSingbox } from '../plugins/SingboxPlugin';
import { runNetworkDiagnostics } from '../utils/networkDiagnostics';
import { buildUniversalSingBoxConfig, validateSingBoxConfig } from '../utils/singboxConfig';
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
 * (Retained for backwards compatibility; forwards to buildUniversalSingBoxConfig)
 */
export function buildSingBoxConfigFromWireguard(tunnel: WireguardTunnelConfig): SingBoxConfigObject {
  return buildUniversalSingBoxConfig(tunnel, { isMobile: true });
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
                // Execute silent background routing verification
                runNetworkDiagnostics().then((diag) => {
                  if (diag.latencyMs) {
                    updateStats({ latencyPing: diag.latencyMs });
                  }
                }).catch(() => {});
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
            // Execute silent background routing verification
            runNetworkDiagnostics().then((diag) => {
              if (diag.latencyMs) {
                updateStats({ latencyPing: diag.latencyMs });
              }
            }).catch(() => {});
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
      } else {
        // Resolve active tunnel from multi-protocol store with fallback to appStore configs
        const selectedTunnel = useTunnelStore.getState().getActiveTunnel() || activeConfig;

        if (!selectedTunnel) {
          const err = 'No active VPN configuration selected to launch sing-box';
          setEngineError(err);
          setConnectionState('disconnected');
          return false;
        }

        finalConfigObj = buildUniversalSingBoxConfig(selectedTunnel, {
          isMobile: platform === 'mobile',
        });
        finalConfigStr = JSON.stringify(finalConfigObj, null, 2);
      }

      // Strict Schema & Cryptographic Validation before native dispatch
      const validation = validateSingBoxConfig(finalConfigObj || finalConfigStr);
      if (!validation.valid) {
        const err = validation.error || 'Invalid sing-box configuration payload';
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

      // 3. Web Preview Pathway (Graceful preview state transition without fake throughput)
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          setConnectionState('connected');
          const startTimestamp = Date.now();

          updateStats({
            downloadSpeed: 0,
            uploadSpeed: 0,
            totalReceived: 0,
            totalSent: 0,
            latencyPing: 0,
            lastHandshake: 0,
            sessionUptime: '00:00:00',
            connectedSince: startTimestamp,
          });

          resolve(true);
        }, 300);
      });
    },
    [platform, activeConfig, setConnectionState, setEngineError, updateStats]
  );

  // ==========================================================================
  // UNIFIED DISCONNECT DISPATCHER
  // ==========================================================================
  const disconnect = useCallback(async (): Promise<boolean> => {
    setEngineError(null);

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
