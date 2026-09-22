import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import { UriParserFactory } from '../parsers/UriParserFactory';
import { buildUniversalSingBoxConfig } from '../config/SingboxConfigBuilder';
import { validateSingBoxConfig } from '../config/ConfigValidator';
import type {
  TunnelProtocol,
  WireguardParams,
  TunnelItem,
  ParsedTunnel,
  ParseResult,
} from '../types/vpn';

export type { TunnelProtocol, WireguardParams, TunnelItem, ParsedTunnel, ParseResult };

export interface TunnelStoreState {
  tunnels: TunnelItem[];
  activeTunnelId: string | null;
  activeTunnel: TunnelItem | null;

  // Selectors & Getters
  getActiveTunnel: () => TunnelItem | null;

  // Primary Actions
  addTunnel: (rawText: string) => { success: boolean; tunnel?: TunnelItem; error?: string };
  addParsedTunnel: (item: Omit<TunnelItem, 'id' | 'createdAt'>) => TunnelItem;
  addParsedTunnels: (items: ParsedTunnel[]) => {
    success: boolean;
    addedCount: number;
    validTunnels: TunnelItem[];
    errors: string[];
  };
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

      const parsedResult = UriParserFactory.parse(text);

      if (!parsedResult.success || !parsedResult.tunnel) {
        return { success: false, error: parsedResult.error || 'Failed to parse tunnel configuration.' };
      }

      const newTunnel: TunnelItem = {
        ...parsedResult.tunnel,
        id: `tunnel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };

      // Pre-validate sing-box config generation and parameters
      try {
        const generatedConfig = buildUniversalSingBoxConfig(newTunnel, { isMobile: true });
        const validation = validateSingBoxConfig(generatedConfig);
        if (!validation.valid) {
          return { success: false, error: validation.error || 'Invalid configuration parameters' };
        }
      } catch (valErr: any) {
        return { success: false, error: `Configuration validation error: ${valErr?.message || 'Invalid parameters'}` };
      }

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

    addParsedTunnels: (items: ParsedTunnel[]) => {
      if (!Array.isArray(items) || items.length === 0) {
        return { success: false, addedCount: 0, validTunnels: [], errors: ['No nodes found to import'] };
      }

      const validTunnels: TunnelItem[] = [];
      const errors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const newTunnel: TunnelItem = {
          ...item,
          id: `tunnel-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: Date.now() + i,
        };

        try {
          const generatedConfig = buildUniversalSingBoxConfig(newTunnel, { isMobile: true });
          const validation = validateSingBoxConfig(generatedConfig);
          if (!validation.valid) {
            errors.push(`[${item.name || item.endpoint}]: ${validation.error || 'Invalid configuration'}`);
            continue;
          }
          validTunnels.push(newTunnel);
        } catch (valErr: any) {
          errors.push(`[${item.name || item.endpoint}]: ${valErr?.message || 'Validation error'}`);
          continue;
        }
      }

      if (validTunnels.length === 0) {
        return { success: false, addedCount: 0, validTunnels: [], errors };
      }

      const updated = [...validTunnels, ...get().tunnels];
      const firstId = validTunnels[0].id;

      set({
        tunnels: updated,
        activeTunnelId: firstId,
        activeTunnel: validTunnels[0],
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TUNNELS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEY_ACTIVE_TUNNEL, firstId);
      }

      // Synchronize to useAppStore
      validTunnels.forEach((t) => {
        try {
          if (t.protocol === 'wireguard' && t.wireguard) {
            useAppStore.getState().addConfig({
              id: t.id,
              name: t.name,
              endpoint: t.endpoint,
              interface: {
                privateKey: t.wireguard.privateKey,
                address: t.wireguard.address,
                dns: t.wireguard.dns,
                mtu: t.wireguard.mtu,
              },
              peer: {
                publicKey: t.wireguard.publicKey,
                endpoint: t.endpoint,
                allowedIPs: t.wireguard.allowedIPs,
                persistentKeepalive: t.wireguard.persistentKeepalive,
              },
              rawConfig: t.rawConfig,
            });
          }
        } catch (err) {
          console.warn('Failed to mirror node to AppStore:', err);
        }
      });

      return { success: true, addedCount: validTunnels.length, validTunnels, errors };
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
      if (id && selected) {
        const appConfigs = useAppStore.getState().configs;
        const matchingConfig = appConfigs.find(
          (c) => c.id === id || c.name === selected.name || c.endpoint === selected.endpoint
        );
        if (matchingConfig) {
          useAppStore.getState().setActiveConfigId(matchingConfig.id);
        } else if (selected.protocol === 'wireguard' && selected.wireguard) {
          // Only insert into appStore if it is a genuine WireGuard config
          const addedId = useAppStore.getState().addConfig({
            id: selected.id,
            name: selected.name,
            endpoint: selected.endpoint,
            interface: {
              privateKey: selected.wireguard.privateKey,
              address: selected.wireguard.address || '10.14.0.2/32',
              dns: selected.wireguard.dns || '1.1.1.1',
              mtu: selected.wireguard.mtu,
            },
            peer: {
              publicKey: selected.wireguard.publicKey,
              endpoint: selected.endpoint,
              allowedIPs: selected.wireguard.allowedIPs || '0.0.0.0/0',
              persistentKeepalive: selected.wireguard.persistentKeepalive,
            },
            rawConfig: selected.rawConfig,
          });
          useAppStore.getState().setActiveConfigId(addedId);
        } else {
          // For non-WireGuard nodes (VLESS, Trojan, etc.), do NOT synthesize fake WireGuard configs
          useAppStore.getState().setActiveConfigId(selected.id);
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

