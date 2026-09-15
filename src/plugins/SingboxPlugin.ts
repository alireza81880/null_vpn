/**
 * Capacitor Custom Native Plugin Interface: CapacitorSingbox
 * (src/plugins/SingboxPlugin.ts)
 * 
 * Defines the cross-platform native plugin interface bridging Capacitor Mobile
 * runtime to Android's `VpnService` and iOS's `NetworkExtension` (PacketTunnelProvider).
 *
 * ARCHITECTURAL NOTES FOR NATIVE IMPLEMENTATIONS:
 * -------------------------------------------------------------------------------------
 * 1. Android (Kotlin/Java):
 *    - The native implementation binds directly to Android's `android.net.VpnService`
 *      and the `sing-box` gomobile library (`io.nekohasekai.sagernet.singbox`).
 *    - `startEngine({ config })` triggers `VpnService.prepare(context)` to obtain user
 *      permission, then boots the native Go runtime daemon via a Foreground Service
 *      with a sticky Notification (`FOREGROUND_SERVICE_TYPE_SPECIAL_USE` / `SYSTEM_EXEMPTED`).
 *    - Packet processing, TUN virtual interface (`/dev/tun`), routing table enforcement,
 *      and cryptographic transformations execute strictly inside native Go/C threads,
 *      completely decoupled from the Android WebView process.
 *    - Telemetry and state updates are dispatched back across the Capacitor bridge via
 *      `notifyListeners('onStateChange', data)` and `notifyListeners('onTelemetry', stats)`.
 *
 * 2. iOS (Swift/Objective-C):
 *    - Binds directly to Apple's `NetworkExtension.NETunnelProviderManager`.
 *    - `startEngine({ config })` loads or provisions the system VPN profile and initializes
 *      the system-level `PacketTunnelProvider` extension containing the compiled `Libsingbox.xcframework`.
 *    - The NetworkExtension executes in a separate memory-isolated OS process (capped at 15MB MEM
 *      by iOS). The main app WebView can terminate or suspend entirely while the tunnel survives.
 *    - IPC between the NetworkExtension and the container app is maintained via
 *      `NETunnelProviderSession.sendProviderMessage` or shared `AppGroup` Darwin notifications.
 *
 * 3. Power & Battery Performance:
 *    - Zero JavaScript thread execution is required in the background. The WebView can freeze
 *      or hibernate without interrupting VPN packet routing, meeting strict 2026 battery standards.
 */

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import type {
  VpnConnectionStatus,
  VpnStatusPayload,
  VpnTelemetryPayload,
  VpnStartResult,
  VpnStopResult,
  DiagnosticsResult,
} from '../types/singbox';

export interface StartEngineOptions {
  /**
   * Universal sing-box JSON configuration string
   */
  config: string;
}

export interface SingboxPlugin {
  /**
   * Dispatches command to OS VPN service (VpnService on Android, NETunnelProvider on iOS)
   * to instantiate the TUN interface and launch the native sing-box core daemon.
   */
  startEngine(options: StartEngineOptions): Promise<VpnStartResult>;

  /**
   * Gracefully tears down the native tunnel interface, restores default OS DNS/routing,
   * and terminates the background daemon.
   */
  stopEngine(): Promise<VpnStopResult>;

  /**
   * Queries the current operational state of the native mobile tunnel service.
   */
  getEngineStatus(): Promise<VpnStatusPayload>;

  /**
   * Runs network connectivity and TUN route verification test
   */
  runDiagnostics(): Promise<DiagnosticsResult>;

  /**
   * Measures TCP round-trip latency to a server endpoint
   */
  pingServer(options: { host: string; port: number }): Promise<{ success: boolean; latencyMs: number; error?: string }>;

  /**
   * Subscribes to tunnel state transitions ('connecting', 'connected', 'disconnected', 'error').
   */
  addListener(
    eventName: 'onStateChange',
    listenerFunc: (payload: VpnStatusPayload) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to periodic (1Hz) native telemetry streaming (RX/TX, ping, uptime).
   * Note: The native plugin suspends emitting telemetry when the app is in the background
   * to conserve CPU cycles and battery.
   */
  addListener(
    eventName: 'onTelemetry',
    listenerFunc: (telemetry: VpnTelemetryPayload) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Removes all registered native event listeners.
   */
  removeAllListeners(): Promise<void>;
}

/**
 * Register the native Capacitor plugin proxy.
 * If running in a standard web browser or desktop Electron without the mobile plugin,
 * Capacitor provides safe stub fallbacks.
 */
export const CapacitorSingbox = registerPlugin<SingboxPlugin>('SingboxPlugin');
