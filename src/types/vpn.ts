export type Language = 'en' | 'fa';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export type ThemeId =
  | 'neo-ice'
  | 'neo-mauve'
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
  preSharedKey?: string;
  allowedIPs?: string;
  endpoint: string;
  persistentKeepalive?: number;
  reserved?: number[];
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

export type TunnelProtocol = 'wireguard' | 'vless' | 'trojan' | 'vmess' | 'shadowsocks';

export interface WireguardParams {
  address?: string;
  dns?: string;
  privateKey?: string;
  publicKey?: string;
  preSharedKey?: string;
  allowedIPs?: string;
  persistentKeepalive?: number;
  reserved?: number[];
  mtu?: number;
}

export interface TunnelItem {
  id: string;
  name: string;
  protocol: TunnelProtocol;
  endpoint: string;
  host: string;
  port: number;
  uuidOrPassword?: string;
  security?: string;
  sni?: string;
  type?: string;
  flow?: string;
  path?: string;
  insecure?: boolean;
  wsHost?: string;
  maxEarlyData?: number;
  earlyDataHeaderName?: string;
  wireguard?: WireguardParams;
  rawConfig: string;
  createdAt: number;
}

export type ParsedTunnel = Omit<TunnelItem, 'id' | 'createdAt'>;

export interface ParseResult {
  success: boolean;
  tunnel?: ParsedTunnel;
  error?: string;
}
