export type Language = 'en' | 'fa';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export type ThemeId =
  | 'clean-minimal'
  | 'soft-blue'
  | 'pearl'
  | 'morning'
  | 'deep-space'
  | 'slate'
  | 'oled-black'
  | 'midnight'
  | 'cyberpunk-neon'
  | 'aurora-borealis'
  | 'sunset-gradient'
  | 'hacker-green';

export interface WireguardPeer {
  publicKey?: string;
  allowedIPs?: string;
  endpoint: string;
  persistentKeepalive?: number;
}

export interface WireguardInterface {
  privateKey?: string;
  address?: string;
  dns?: string;
  mtu?: number;
}

export interface WireguardTunnelConfig {
  id: string;
  name: string;
  endpoint: string;
  interface?: WireguardInterface;
  peer?: WireguardPeer;
  rawConfig?: string;
  createdAt: number;
}

export interface SessionStats {
  downloadSpeed: number;
  uploadSpeed: number;
  totalReceived: number;
  totalSent: number;
  latencyPing: number;
  lastHandshake: number;
  sessionUptime: string;
  connectedSince: number | null;
}
