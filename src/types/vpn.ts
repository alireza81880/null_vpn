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

export interface XHttpParams {
  mode?: string; // 'auto' | 'stream-up' | 'stream-one' | 'packet-up'
  path?: string;
  host?: string;
  headers?: Record<string, string>;
  x_padding_bytes?: string | number;
  no_grpc_header?: boolean;
  xmux?: Record<string, any>;
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
  xhttp?: XHttpParams;
  reality?: {
    publicKey?: string;
    shortId?: string;
  };
  utls?: {
    fingerprint?: string;
  };
  packetEncoding?: string;
  alpn?: string[];
  wireguard?: WireguardParams;
  subscriptionId?: string;
  subscriptionName?: string;
  rawConfig: string;
  createdAt: number;
}

export type ParsedTunnel = Omit<TunnelItem, 'id' | 'createdAt'>;

export interface ParseResult {
  success: boolean;
  tunnel?: ParsedTunnel;
  error?: string;
}

export type SubscriptionFormat = 'plain' | 'base64' | 'singbox-json' | 'clash-yaml' | 'unknown';

export interface SubscriptionParseError {
  line?: number;
  raw?: string;
  error: string;
}

export interface SubscriptionParseResult {
  format: SubscriptionFormat;
  nodes: ParsedTunnel[];
  errors: SubscriptionParseError[];
  nodeCount: number;
  unsupportedMessage?: string;
}

export interface FetchSubscriptionResult {
  success: boolean;
  content?: string;
  contentType?: string;
  headers?: Record<string, string>;
  error?: string;
  status?: number;
}
