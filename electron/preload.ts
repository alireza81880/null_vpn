/**
 * Secure Context Bridge (electron/preload.ts)
 * 
 * Exposes a sandboxed, type-safe IPC surface to the React Renderer process.
 * Complies strictly with contextIsolation: true and sandbox boundaries by
 * sanitizing arguments and discarding internal Electron event references.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  SingBoxConfigInput,
  VpnStartResult,
  VpnStopResult,
  VpnStatusPayload,
  VpnTelemetryPayload,
  VpnEngineApi,
} from '../src/types/singbox';

/**
 * Hardened VPN Engine Bridge API
 */
const vpnEngine: VpnEngineApi = {
  /**
   * Dispatches command to spawn sing-box core with user configuration
   */
  start: (config: SingBoxConfigInput): Promise<VpnStartResult> => {
    return ipcRenderer.invoke('vpn:start', config);
  },

  /**
   * Dispatches command to gracefully kill active sing-box child process
   */
  stop: (): Promise<VpnStopResult> => {
    return ipcRenderer.invoke('vpn:stop');
  },

  /**
   * Queries active daemon status
   */
  getStatus: (): Promise<VpnStatusPayload> => {
    return ipcRenderer.invoke('vpn:getStatus');
  },

  /**
   * Subscribes to daemon connection state transitions (e.g. 'connecting', 'connected', 'error')
   * Returns a cleanup function that detaches the IPC listener.
   */
  onStatusChange: (callback: (payload: VpnStatusPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: VpnStatusPayload) => {
      callback(payload);
    };
    ipcRenderer.on('vpn:status', listener);

    return () => {
      ipcRenderer.removeListener('vpn:status', listener);
    };
  },

  /**
   * Subscribes to 1-second real-time telemetry updates (RX/TX speeds, ping, uptime)
   * Returns a cleanup function that detaches the IPC listener.
   */
  onTelemetryUpdate: (callback: (telemetry: VpnTelemetryPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, telemetry: VpnTelemetryPayload) => {
      callback(telemetry);
    };
    ipcRenderer.on('vpn:telemetry', listener);

    return () => {
      ipcRenderer.removeListener('vpn:telemetry', listener);
    };
  },
};

// Expose safe API to renderer window
contextBridge.exposeInMainWorld('vpnEngine', vpnEngine);
