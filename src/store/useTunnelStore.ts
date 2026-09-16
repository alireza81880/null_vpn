import { create } from 'zustand';
import { useAppStore } from './useAppStore';

export type TunnelProtocol = 'wireguard' | 'vless' | 'trojan' | 'vmess' | 'shadowsocks';

export interface WireguardParams {
  address?: string;
  dns?: string;
  privateKey?: string;
  publicKey?: string;
  allowedIPs?: string;
  persistentKeepalive?: number;
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

export interface TunnelStoreState {
  tunnels: TunnelItem[];
  activeTunnelId: string | null;
  activeTunnel: TunnelItem | null;

  // Selectors & Getters
  getActiveTunnel: () => TunnelItem | null;

  // Primary Actions
  addTunnel: (rawText: string) => { success: boolean; tunnel?: TunnelItem; error?: string };
  addParsedTunnel: (item: Omit<TunnelItem, 'id' | 'createdAt'>) => TunnelItem;
  updateTunnel: (id: string, updates: Partial<TunnelItem>) => void;
  removeTunnel: (id: string) => void;
  setActiveTunnel: (id: string | null) => void;
  clearTunnels: () => void;
}

const STORAGE_KEY_TUNNELS = 'aegis_vpn_tunnels_v2';
const STORAGE_KEY_ACTIVE_TUNNEL = 'aegis_vpn_active_tunnel_id_v2';

const loadPersistedTunnels = (): TunnelItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TUNNELS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Fallback: check useAppStore configs
    const appConfigsRaw = localStorage.getItem('aegis_vpn_configs');
    if (appConfigsRaw) {
      const appConfigs = JSON.parse(appConfigsRaw);
      if (Array.isArray(appConfigs) && appConfigs.length > 0) {
        return appConfigs.map((c: any) => ({
          id: c.id,
          name: c.name,
          protocol: 'wireguard' as TunnelProtocol,
          endpoint: c.endpoint || '127.0.0.1:51820',
          host: c.endpoint?.split(':')[0] || '127.0.0.1',
          port: parseInt(c.endpoint?.split(':')[1] || '51820', 10),
          wireguard: {
            address: c.interface?.address,
            dns: c.interface?.dns,
            privateKey: c.interface?.privateKey,
            publicKey: c.peer?.publicKey,
            allowedIPs: c.peer?.allowedIPs,
            persistentKeepalive: c.peer?.persistentKeepalive,
            mtu: c.interface?.mtu,
          },
          rawConfig: c.rawConfig || '',
          createdAt: c.createdAt || Date.now(),
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
};

const loadPersistedActiveTunnel = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_ACTIVE_TUNNEL) || null;
};

// ============================================================================
// PROTOCOL PARSERS
// ============================================================================

/**
 * Parses INI-style WireGuard configuration files (.conf)
 */
function parseWireGuardConfig(rawText: string): { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string } {
  const lines = rawText.split(/\r?\n/);
  let currentSection = '';
  const iface: Record<string, string> = {};
  const peer: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).toLowerCase();
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const val = trimmed.slice(eqIdx + 1).trim();

      if (currentSection === 'interface') {
        iface[key] = val;
      } else if (currentSection === 'peer') {
        peer[key] = val;
      }
    }
  }

  const endpoint = peer['endpoint'] || '';
  if (!endpoint) {
    return { success: false, error: 'WireGuard config missing [Peer] Endpoint parameter' };
  }

  let host = endpoint;
  let port = 51820;
  if (endpoint.includes(':')) {
    const lastColon = endpoint.lastIndexOf(':');
    host = endpoint.slice(0, lastColon);
    const parsedPort = parseInt(endpoint.slice(lastColon + 1), 10);
    if (!isNaN(parsedPort)) port = parsedPort;
  }

  const wgParams: WireguardParams = {
    address: iface['address'],
    dns: iface['dns'],
    privateKey: iface['privatekey'],
    publicKey: peer['publickey'],
    allowedIPs: peer['allowedips'] || '0.0.0.0/0, ::/0',
    persistentKeepalive: peer['persistentkeepalive'] ? parseInt(peer['persistentkeepalive'], 10) : 25,
    mtu: iface['mtu'] ? parseInt(iface['mtu'], 10) : 1420,
  };

  return {
    success: true,
    tunnel: {
      name: `WG-${host.slice(0, 16)}`,
      protocol: 'wireguard',
      endpoint,
      host,
      port,
      wireguard: wgParams,
      rawConfig: rawText.trim(),
    },
  };
}

/**
 * Parses VLESS URI links: vless://uuid@host:port?query#name
 */
function parseVlessUri(rawUri: string): { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string } {
  try {
    const uri = new URL(rawUri);
    const uuid = uri.username;
    const host = uri.hostname;
    const port = parseInt(uri.port || '443', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `VLESS-${host}`;

    const params = uri.searchParams;
    const type = params.get('type') || 'tcp';
    const security = params.get('security') || 'tls';
    const sni = params.get('sni') || host;
    const flow = params.get('flow') || undefined;
    const rawPath = params.get('path') || undefined;
    let cleanPath = rawPath;
    let maxEarlyData: number | undefined = undefined;
    let earlyDataHeaderName: string | undefined = undefined;

    if (rawPath) {
      if (rawPath.includes('?')) {
        const [basePath, search] = rawPath.split('?');
        const searchParams = new URLSearchParams(search);
        const edVal = searchParams.get('ed');
        if (edVal) {
          const parsedEd = parseInt(edVal, 10);
          if (!isNaN(parsedEd)) {
            maxEarlyData = parsedEd;
            earlyDataHeaderName = 'Sec-WebSocket-Protocol';
          }
          searchParams.delete('ed');
        }
        const remainingSearch = searchParams.toString();
        cleanPath = remainingSearch ? `${basePath}?${remainingSearch}` : basePath;
      }
    }

    if (maxEarlyData === undefined && params.get('ed')) {
      const parsedEd = parseInt(params.get('ed')!, 10);
      if (!isNaN(parsedEd)) {
        maxEarlyData = parsedEd;
        earlyDataHeaderName = 'Sec-WebSocket-Protocol';
      }
    }

    const insecure = params.get('allowInsecure') === '1';
    const wsHost = params.get('host') || undefined;

    return {
      success: true,
      tunnel: {
        name,
        protocol: 'vless',
        endpoint: `${host}:${port}`,
        host,
        port,
        uuidOrPassword: uuid,
        security,
        sni,
        type,
        flow,
        path: cleanPath,
        insecure,
        wsHost,
        maxEarlyData,
        earlyDataHeaderName,
        rawConfig: rawUri.trim(),
      },
    };
  } catch (err: any) {
    return { success: false, error: `Invalid VLESS URI: ${err?.message || 'Malformed structure'}` };
  }
}

/**
 * Parses Trojan URI links: trojan://password@host:port?query#name
 */
function parseTrojanUri(rawUri: string): { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string } {
  try {
    const uri = new URL(rawUri);
    const password = uri.username;
    const host = uri.hostname;
    const port = parseInt(uri.port || '443', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `Trojan-${host}`;

    const params = uri.searchParams;
    const type = params.get('type') || 'tcp';
    const security = params.get('security') || 'tls';
    const sni = params.get('sni') || host;

    return {
      success: true,
      tunnel: {
        name,
        protocol: 'trojan',
        endpoint: `${host}:${port}`,
        host,
        port,
        uuidOrPassword: password,
        security,
        sni,
        type,
        rawConfig: rawUri.trim(),
      },
    };
  } catch (err: any) {
    return { success: false, error: `Invalid Trojan URI: ${err?.message || 'Malformed structure'}` };
  }
}

/**
 * Parses VMess URI links: vmess://base64-json
 */
function parseVmessUri(rawUri: string): { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string } {
  try {
    const base64Str = rawUri.replace(/^vmess:\/\//i, '');
    const jsonStr = atob(base64Str.trim());
    const obj = JSON.parse(jsonStr);

    const host = obj.add || 'localhost';
    const port = parseInt(obj.port || '443', 10);
    const name = obj.ps ? String(obj.ps).trim() : `VMess-${host}`;

    return {
      success: true,
      tunnel: {
        name,
        protocol: 'vmess',
        endpoint: `${host}:${port}`,
        host,
        port,
        uuidOrPassword: obj.id,
        security: obj.tls === 'tls' ? 'tls' : 'none',
        sni: obj.sni || obj.host || host,
        type: obj.net || 'tcp',
        path: obj.path,
        rawConfig: rawUri.trim(),
      },
    };
  } catch (err: any) {
    return { success: false, error: `Invalid VMess URI: ${err?.message || 'Failed to decode base64 JSON'}` };
  }
}

/**
 * Parses Shadowsocks URI links: ss://...
 */
function parseShadowsocksUri(rawUri: string): { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string } {
  try {
    const uri = new URL(rawUri);
    const host = uri.hostname;
    const port = parseInt(uri.port || '8388', 10);
    const name = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : `SS-${host}`;

    return {
      success: true,
      tunnel: {
        name,
        protocol: 'shadowsocks',
        endpoint: `${host}:${port}`,
        host,
        port,
        uuidOrPassword: uri.username,
        rawConfig: rawUri.trim(),
      },
    };
  } catch {
    // Attempt base64 decode for legacy format ss://base64#name
    try {
      const withoutPrefix = rawUri.replace(/^ss:\/\//i, '');
      const hashIdx = withoutPrefix.indexOf('#');
      const b64 = hashIdx !== -1 ? withoutPrefix.slice(0, hashIdx) : withoutPrefix;
      const name = hashIdx !== -1 ? decodeURIComponent(withoutPrefix.slice(hashIdx + 1)) : 'Shadowsocks';
      const decoded = atob(b64);
      const atIdx = decoded.indexOf('@');
      if (atIdx !== -1) {
        const hostPort = decoded.slice(atIdx + 1);
        const [host, portStr] = hostPort.split(':');
        const port = parseInt(portStr || '8388', 10);
        return {
          success: true,
          tunnel: {
            name,
            protocol: 'shadowsocks',
            endpoint: `${host}:${port}`,
            host,
            port,
            rawConfig: rawUri.trim(),
          },
        };
      }
    } catch {}
    return { success: false, error: 'Failed to parse Shadowsocks configuration link' };
  }
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

export const useTunnelStore = create<TunnelStoreState>((set, get) => {
  const initialTunnels = loadPersistedTunnels();
  const initialActiveId = loadPersistedActiveTunnel();
  const validActiveId =
    initialActiveId && initialTunnels.some((t) => t.id === initialActiveId)
      ? initialActiveId
      : initialTunnels[0]?.id ?? null;
  const initialActiveTunnel =
    initialTunnels.find((t) => t.id === validActiveId) || initialTunnels[0] || null;

  return {
    tunnels: initialTunnels,
    activeTunnelId: validActiveId,
    activeTunnel: initialActiveTunnel,

    getActiveTunnel: () => {
      const { tunnels, activeTunnelId } = get();
      return tunnels.find((t) => t.id === activeTunnelId) || tunnels[0] || null;
    },

    addTunnel: (rawText: string) => {
      const text = rawText.trim();
      if (!text) {
        return { success: false, error: 'Input is empty. Please provide a config or URI.' };
      }

      let parsedResult: { success: boolean; tunnel?: Omit<TunnelItem, 'id' | 'createdAt'>; error?: string };

      // 1. Detect WireGuard INI config
      if (text.includes('[Interface]') || text.includes('[interface]') || text.includes('[Peer]') || text.includes('[peer]')) {
        parsedResult = parseWireGuardConfig(text);
      }
      // 2. Detect VLESS URI
      else if (text.toLowerCase().startsWith('vless://')) {
        parsedResult = parseVlessUri(text);
      }
      // 3. Detect Trojan URI
      else if (text.toLowerCase().startsWith('trojan://')) {
        parsedResult = parseTrojanUri(text);
      }
      // 4. Detect VMess URI
      else if (text.toLowerCase().startsWith('vmess://')) {
        parsedResult = parseVmessUri(text);
      }
      // 5. Detect Shadowsocks URI
      else if (text.toLowerCase().startsWith('ss://')) {
        parsedResult = parseShadowsocksUri(text);
      }
      // Fallback: Generic WireGuard attempts
      else if (text.includes('PrivateKey') || text.includes('Endpoint')) {
        parsedResult = parseWireGuardConfig(text);
      } else {
        return {
          success: false,
          error: 'Unrecognized format. Supported: WireGuard (.conf), vless://, trojan://, vmess://, ss://',
        };
      }

      if (!parsedResult.success || !parsedResult.tunnel) {
        return { success: false, error: parsedResult.error || 'Failed to parse tunnel configuration.' };
      }

      const newTunnel: TunnelItem = {
        ...parsedResult.tunnel,
        id: `tunnel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };

      const updated = [newTunnel, ...get().tunnels];
      set({
        tunnels: updated,
        activeTunnelId: newTunnel.id,
        activeTunnel: newTunnel,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TUNNELS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEY_ACTIVE_TUNNEL, newTunnel.id);
      }

      // Synchronize WireGuard config into useAppStore so the main connection engine can use it
      if (newTunnel.protocol === 'wireguard' && newTunnel.wireguard) {
        try {
          useAppStore.getState().addConfig({
            id: newTunnel.id,
            name: newTunnel.name,
            endpoint: newTunnel.endpoint,
            interface: {
              privateKey: newTunnel.wireguard.privateKey,
              address: newTunnel.wireguard.address,
              dns: newTunnel.wireguard.dns,
              mtu: newTunnel.wireguard.mtu,
            },
            peer: {
              publicKey: newTunnel.wireguard.publicKey,
              endpoint: newTunnel.endpoint,
              allowedIPs: newTunnel.wireguard.allowedIPs,
              persistentKeepalive: newTunnel.wireguard.persistentKeepalive,
            },
            rawConfig: newTunnel.rawConfig,
          });
        } catch (err) {
          console.warn('Failed to mirror WireGuard configuration to AppStore:', err);
        }
      } else {
        // Mirror non-WireGuard proxy configs into useAppStore as well with standard interface mock
        try {
          useAppStore.getState().addConfig({
            id: newTunnel.id,
            name: newTunnel.name,
            endpoint: newTunnel.endpoint,
            interface: {
              address: '10.14.0.2/32',
              dns: '1.1.1.1',
            },
            peer: {
              endpoint: newTunnel.endpoint,
              allowedIPs: '0.0.0.0/0',
            },
            rawConfig: newTunnel.rawConfig,
          });
        } catch (err) {
          console.warn('Failed to mirror proxy configuration to AppStore:', err);
        }
      }

      return { success: true, tunnel: newTunnel };
    },

    addParsedTunnel: (item) => {
      const newTunnel: TunnelItem = {
        ...item,
        id: `tunnel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };
      const updated = [newTunnel, ...get().tunnels];
      set({
        tunnels: updated,
        activeTunnelId: newTunnel.id,
        activeTunnel: newTunnel,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TUNNELS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEY_ACTIVE_TUNNEL, newTunnel.id);
      }

      return newTunnel;
    },

    updateTunnel: (id: string, updates: Partial<TunnelItem>) => {
      const prevTunnel = get().tunnels.find((t) => t.id === id);
      const updated = get().tunnels.map((t) => (t.id === id ? { ...t, ...updates } : t));

      // If updated tunnel is the active tunnel, patch activeTunnel as well
      const currentActiveId = get().activeTunnelId;
      const isEditingActive = currentActiveId === id || get().activeTunnel?.id === id;
      const nextActiveTunnel = isEditingActive
        ? updated.find((t) => t.id === id) || null
        : get().activeTunnel;

      set({
        tunnels: updated,
        activeTunnel: nextActiveTunnel,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TUNNELS, JSON.stringify(updated));
      }

      // Mirror to useAppStore configs so Dashboard and VPN engines reflect changes immediately
      const appState = useAppStore.getState();
      const matchingAppConfig = appState.configs.find(
        (c) => c.id === id || (prevTunnel && (c.name === prevTunnel.name || c.endpoint === prevTunnel.endpoint))
      );
      if (matchingAppConfig) {
        appState.updateConfig(matchingAppConfig.id, {
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.endpoint ? { endpoint: updates.endpoint } : {}),
        });
      }
    },

    removeTunnel: (id: string) => {
      const victim = get().tunnels.find((t) => t.id === id);
      const remaining = get().tunnels.filter((t) => t.id !== id);
      const activeId = get().activeTunnelId === id ? (remaining[0]?.id ?? null) : get().activeTunnelId;
      const nextActiveTunnel = remaining.find((t) => t.id === activeId) || remaining[0] || null;

      set({
        tunnels: remaining,
        activeTunnelId: activeId,
        activeTunnel: nextActiveTunnel,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TUNNELS, JSON.stringify(remaining));
        if (activeId) {
          localStorage.setItem(STORAGE_KEY_ACTIVE_TUNNEL, activeId);
        } else {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_TUNNEL);
        }
      }

      // Mirror deletion to useAppStore (configs array and activeConfigId)
      const appState = useAppStore.getState();
      const matchingAppConfig = appState.configs.find(
        (c) => c.id === id || (victim && (c.name === victim.name || c.endpoint === victim.endpoint))
      );
      if (matchingAppConfig) {
        appState.removeConfig(matchingAppConfig.id);
      }
    },

    setActiveTunnel: (id: string | null) => {
      const selected = get().tunnels.find((t) => t.id === id) || null;
      set({
        activeTunnelId: id,
        activeTunnel: selected,
      });

      if (typeof window !== 'undefined') {
        if (id) {
          localStorage.setItem(STORAGE_KEY_ACTIVE_TUNNEL, id);
        } else {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_TUNNEL);
        }
      }

      // Mirror to useAppStore activeConfigId
      if (id) {
        if (selected) {
          const appConfigs = useAppStore.getState().configs;
          const matchingConfig = appConfigs.find(
            (c) => c.id === id || c.name === selected.name || c.endpoint === selected.endpoint
          );
          if (matchingConfig) {
            useAppStore.getState().setActiveConfigId(matchingConfig.id);
          } else {
            // If not in appStore, insert it so dashboard can connect
            const addedId = useAppStore.getState().addConfig({
              id: selected.id,
              name: selected.name,
              endpoint: selected.endpoint,
              interface: {
                privateKey: selected.wireguard?.privateKey,
                address: selected.wireguard?.address || '10.14.0.2/32',
                dns: selected.wireguard?.dns || '1.1.1.1',
                mtu: selected.wireguard?.mtu,
              },
              peer: {
                publicKey: selected.wireguard?.publicKey,
                endpoint: selected.endpoint,
                allowedIPs: selected.wireguard?.allowedIPs || '0.0.0.0/0',
                persistentKeepalive: selected.wireguard?.persistentKeepalive,
              },
              rawConfig: selected.rawConfig,
            });
            useAppStore.getState().setActiveConfigId(addedId);
          }
        }
      }
    },

    clearTunnels: () => {
      set({ tunnels: [], activeTunnelId: null, activeTunnel: null });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_TUNNELS);
        localStorage.removeItem(STORAGE_KEY_ACTIVE_TUNNEL);
      }
    },
  };
});

/**
 * Derived selector hook: Dynamically resolves active tunnel from tunnels array
 * guarantees instant reactivity when a tunnel name or endpoint is edited.
 */
export const useActiveTunnel = (): TunnelItem | null => {
  return useTunnelStore((state) => {
    return state.tunnels.find((t) => t.id === state.activeTunnelId) || state.activeTunnel || state.tunnels[0] || null;
  });
};

