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
import { buildUniversalSingBoxConfig } from '../config/SingboxConfigBuilder';
import { validateSingBoxConfig } from '../config/ConfigValidator';
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

  // Stable references for values used in listeners to prevent re-registration cycles
  const isAppActiveRef = useRef(isAppActive);
  isAppActiveRef.current = isAppActive;

  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Attempt generation tracker and connection timeout watchdog
  const attemptGenerationRef = useRef<number>(0);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const startConnectionTimeout = useCallback((expectedGen: number) => {
    clearConnectionTimeout();
    connectionTimeoutRef.current = setTimeout(async () => {
      if (attemptGenerationRef.current !== expectedGen) {
        return;
      }

      const currentState = useAppStore.getState().connectionState;
      if (currentState !== 'connecting') {
        return;
      }

      // Invalidate current attempt generation
      attemptGenerationRef.current++;
      connectionTimeoutRef.current = null;

      // Stop active OS / daemon session
      try {
        if (platform === 'mobile') {
          await CapacitorSingbox.stopEngine();
        } else if (platform === 'electron' && window.vpnEngine) {
          await window.vpnEngine.stop();
        }
      } catch (err) {
        console.warn('[useVpnEngine] Timeout abort error:', err);
      }

      // Deterministically transition UI to disconnected with clear timeout error
      setConnectionState('disconnected');
      setEngineError('Connection timed out. Please try again.');
      updateStats({
        downloadSpeed: 0,
        uploadSpeed: 0,
        connectedSince: null,
      });
    }, 18000); // 18-second connection timeout
  }, [clearConnectionTimeout, platform, setConnectionState, setEngineError, updateStats]);

  // ==========================================================================
  // UNIFIED TELEMETRY & STATE SUBSCRIPTIONS
  // ==========================================================================
  useEffect(() => {
    let isSubscribed = true;

    // PATHWAY 1: Mobile (Capacitor Native Plugin via Android VpnService / iOS NetworkExtension)
    if (platform === 'mobile') {
      const activeHandles: PluginListenerHandle[] = [];

      const attachStateListener = async () => {
        try {
          const handle = await CapacitorSingbox.addListener('onStateChange', (payload: VpnStatusPayload) => {
            if (!isSubscribed) return;
            switch (payload.status) {
              case 'connecting':
              case 'core_running':
              case 'tunnel_verified':
                // If the user canceled or disconnected, ignore late connecting callbacks
                if (useAppStore.getState().connectionState === 'disconnected' && !connectionTimeoutRef.current) {
                  return;
                }
                setConnectionState('connecting');
                break;
              case 'connected':
                clearConnectionTimeout();
                // If user canceled before connected arrived, kill the zombie engine and ignore
                if (useAppStore.getState().connectionState === 'disconnected') {
                  CapacitorSingbox.stopEngine().catch(() => {});
                  return;
                }
                setConnectionState('connected');
                setEngineError(null);
                // Execute silent background routing verification
                runNetworkDiagnostics().then((diag) => {
                  if (diag.latencyMs) {
                    updateStats({ latencyPing: diag.latencyMs });
                  }
                }).catch(() => {});
                break;
              case 'disconnecting':
                clearConnectionTimeout();
                setConnectionState('disconnecting');
                break;
              case 'disconnected':
                clearConnectionTimeout();
                setConnectionState('disconnected');
                break;
              case 'error':
                clearConnectionTimeout();
                setConnectionState('disconnected');
                setEngineError(payload.message || 'Mobile VPN engine error occurred');
                break;
            }
          });

          if (!isSubscribed) {
            handle.remove();
          } else {
            activeHandles.push(handle);
          }
        } catch (err) {
          console.warn('[SingboxPlugin] Failed to register onStateChange listener:', err);
        }
      };

      const attachTelemetryListener = async () => {
        try {
          const handle = await CapacitorSingbox.addListener('onTelemetry', (telemetry: VpnTelemetryPayload) => {
            if (!isSubscribed || !isAppActiveRef.current) return;

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
                  : statsRef.current.sessionUptime,
            });
          });

          if (!isSubscribed) {
            handle.remove();
          } else {
            activeHandles.push(handle);
          }
        } catch (err) {
          console.warn('[SingboxPlugin] Failed to register onTelemetry listener:', err);
        }
      };

      attachStateListener();
      attachTelemetryListener();

      return () => {
        isSubscribed = false;
        clearConnectionTimeout();
        activeHandles.forEach((handle) => {
          try {
            handle.remove();
          } catch (err) {
            console.warn('[SingboxPlugin] Error removing listener handle on cleanup:', err);
          }
        });
        activeHandles.length = 0;
      };
    }

    // PATHWAY 2: Desktop (Electron IPC via sing-box supervisor daemon)
    if (platform === 'electron' && window.vpnEngine) {
      const unsubscribeStatus = window.vpnEngine.onStatusChange((payload: VpnStatusPayload) => {
        if (!isSubscribed) return;
        switch (payload.status) {
          case 'connecting':
            if (useAppStore.getState().connectionState === 'disconnected' && !connectionTimeoutRef.current) {
              return;
            }
            setConnectionState('connecting');
            break;
          case 'connected':
            clearConnectionTimeout();
            if (useAppStore.getState().connectionState === 'disconnected') {
              window.vpnEngine.stop().catch(() => {});
              return;
            }
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
            clearConnectionTimeout();
            setConnectionState('disconnected');
            break;
          case 'error':
            clearConnectionTimeout();
            setConnectionState('disconnected');
            setEngineError(payload.message || 'Desktop tunnel error occurred');
            break;
        }
      });

      const unsubscribeTelemetry = window.vpnEngine.onTelemetryUpdate((telemetry: VpnTelemetryPayload) => {
        if (!isSubscribed || !isAppActiveRef.current) return;

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
              : statsRef.current.sessionUptime,
        });
      });

      return () => {
        isSubscribed = false;
        clearConnectionTimeout();
        unsubscribeStatus();
        unsubscribeTelemetry();
      };
    }

    return () => {
      isSubscribed = false;
      clearConnectionTimeout();
    };
  }, [platform, setConnectionState, setEngineError, updateStats, clearConnectionTimeout]);

  // ==========================================================================
  // UNIFIED CONNECT DISPATCHER
  // ==========================================================================
  const connect = useCallback(
    async (customConfig?: SingBoxConfigInput): Promise<boolean> => {
      clearConnectionTimeout();
      const currentGen = ++attemptGenerationRef.current;
      setEngineError(null);
      setConnectionState('connecting');
      startConnectionTimeout(currentGen);

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
        // Resolve authoritative active TunnelItem source from useTunnelStore (with fallback for existing WireGuard configs)
        const activeTunnelItem = useTunnelStore.getState().getActiveTunnel();
        const selectedTunnel = activeTunnelItem || (activeConfig ? {
          id: activeConfig.id,
          name: activeConfig.name,
          protocol: 'wireguard' as const,
          endpoint: activeConfig.endpoint || '127.0.0.1:51820',
          host: activeConfig.endpoint?.split(':')[0] || '127.0.0.1',
          port: parseInt(activeConfig.endpoint?.split(':')[1] || '51820', 10),
          wireguard: {
            address: activeConfig.interface?.address,
            dns: activeConfig.interface?.dns,
            privateKey: activeConfig.interface?.privateKey,
            publicKey: activeConfig.peer?.publicKey,
            allowedIPs: activeConfig.peer?.allowedIPs,
            persistentKeepalive: activeConfig.peer?.persistentKeepalive,
            mtu: activeConfig.interface?.mtu,
          },
          rawConfig: activeConfig.rawConfig || '',
          createdAt: activeConfig.createdAt || Date.now(),
        } : null);

        if (!selectedTunnel) {
          clearConnectionTimeout();
          attemptGenerationRef.current++;
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
        clearConnectionTimeout();
        attemptGenerationRef.current++;
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
            clearConnectionTimeout();
            attemptGenerationRef.current++;
            const errorMsg = result.error || 'Failed to initialize OS VPN Service';
            setEngineError(errorMsg);
            setConnectionState('disconnected');
            return false;
          }
          return true;
        } catch (err: unknown) {
          clearConnectionTimeout();
          attemptGenerationRef.current++;
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
            clearConnectionTimeout();
            attemptGenerationRef.current++;
            const errorMsg = result.error || 'Failed to start sing-box proxy engine';
            setEngineError(errorMsg);
            setConnectionState('disconnected');
            return false;
          }
          return true;
        } catch (err: unknown) {
          clearConnectionTimeout();
          attemptGenerationRef.current++;
          const errorMsg = err instanceof Error ? err.message : 'IPC call to vpnEngine.start failed';
          setEngineError(errorMsg);
          setConnectionState('disconnected');
          return false;
        }
      }

      // 3. Web Preview Pathway (Graceful preview state transition without fake throughput)
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          clearConnectionTimeout();
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
    [platform, activeConfig, setConnectionState, setEngineError, updateStats, clearConnectionTimeout, startConnectionTimeout]
  );

  // ==========================================================================
  // UNIFIED DISCONNECT DISPATCHER
  // ==========================================================================
  const disconnect = useCallback(async (): Promise<boolean> => {
    // 1. Advance attempt generation to invalidate in-flight connection callbacks
    attemptGenerationRef.current++;
    // 2. Clear connection timeout watchdog
    clearConnectionTimeout();
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
  }, [platform, setConnectionState, setEngineError, updateStats, clearConnectionTimeout]);

  /**
   * Coordinated Profile Switcher
   * Ensures the previous VPN session is completely stopped before launching a new one.
   */
  const switchTunnel = useCallback(
    async (targetTunnelId: string): Promise<boolean> => {
      const currentState = useAppStore.getState().connectionState;

      // 1. If currently disconnected, simple state update without restarting engine
      if (currentState === 'disconnected') {
        useTunnelStore.getState().setActiveTunnel(targetTunnelId);
        useAppStore.getState().setActiveConfigId(targetTunnelId);
        return true;
      }

      // 2. If connected or connecting:
      // a) Stop/cancel current session
      await disconnect();

      // b) Wait for deterministic disconnected state
      const stopDeadline = Date.now() + 2000;
      while (Date.now() < stopDeadline) {
        if (useAppStore.getState().connectionState === 'disconnected') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // c) Switch active tunnel and config
      useTunnelStore.getState().setActiveTunnel(targetTunnelId);
      useAppStore.getState().setActiveConfigId(targetTunnelId);

      // Settle stores and native service
      await new Promise((resolve) => setTimeout(resolve, 80));

      // d) Start newly selected configuration cleanly
      return await connect();
    },
    [disconnect, connect]
  );

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
    switchTunnel,
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
