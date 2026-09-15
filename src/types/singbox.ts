/**
 * Sing-Box Core Types & Telemetry Models for Null VPN (2026 Engine Architecture)
 */

export type VpnConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface VpnTelemetryPayload {
  downloadSpeed: number; // bytes/sec
  uploadSpeed: number;   // bytes/sec
  totalReceived: number; // bytes
  totalSent: number;     // bytes
  latencyPing: number;   // ms
  lastHandshake?: number;
  uptimeSeconds?: number;
  memoryUsageMb?: number;
}

export interface VpnStatusPayload {
  status: VpnConnectionStatus;
  message?: string;
  timestamp: number;
}

export interface VpnStartResult {
  success: boolean;
  error?: string;
  pid?: number;
}

export interface VpnStopResult {
  success: boolean;
  error?: string;
}

/**
 * Sing-box Universal Inbound/Outbound Configuration Structure
 * Supports VLESS, Reality, Hysteria2, Trojan, WireGuard, and Shadowsocks
 */
export interface SingBoxOutbound {
  type: 'vless' | 'reality' | 'hysteria2' | 'trojan' | 'wireguard' | 'shadowsocks' | 'direct' | 'block';
  tag: string;
  server?: string;
  server_port?: number;
  uuid?: string;
  password?: string;
  flow?: string;
  tls?: {
    enabled?: boolean;
    server_name?: string;
    reality?: {
      enabled?: boolean;
      public_key?: string;
      short_id?: string;
    };
  };
  transport?: {
    type?: string;
    path?: string;
    headers?: Record<string, string>;
  };
  network?: string;
  system_interface?: boolean;
  interface_name?: string;
  local_address?: string[];
  private_key?: string;
  peer_public_key?: string;
  [key: string]: unknown;
}

export interface SingBoxConfigObject {
  log?: {
    disabled?: boolean;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    timestamp?: boolean;
  };
  dns?: Record<string, unknown>;
  inbounds?: Array<Record<string, unknown>>;
  outbounds?: SingBoxOutbound[];
  route?: Record<string, unknown>;
  experimental?: {
    clash_api?: {
      external_controller?: string;
      external_ui?: string;
      secret?: string;
      default_mode?: string;
    };
    v2ray_api?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export type SingBoxConfigInput = SingBoxConfigObject | string;

export interface DiagnosticsResult {
  success: boolean;
  active: boolean;
  latencyMs?: number;
  ip?: string;
  interfaceName?: string;
  message: string;
  timestamp: number;
}

/**
 * Window VPN Engine Interface exposed via Electron contextBridge
 */
export interface VpnEngineApi {
  start: (config: SingBoxConfigInput) => Promise<VpnStartResult>;
  stop: () => Promise<VpnStopResult>;
  getStatus: () => Promise<VpnStatusPayload>;
  runDiagnostics: () => Promise<DiagnosticsResult>;
  pingServer?: (ip: string, port: number) => Promise<{ success: boolean; latencyMs: number; error?: string }>;
  onStatusChange: (callback: (payload: VpnStatusPayload) => void) => () => void;
  onTelemetryUpdate: (callback: (telemetry: VpnTelemetryPayload) => void) => () => void;
}
