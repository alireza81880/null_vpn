import { create } from 'zustand';
import type {
  Language,
  ConnectionState,
  ThemeId,
  WireguardTunnelConfig,
  SessionStats,
} from '../types/vpn';
import { sanitizeWireGuardKey, isValidBase64Key } from '../config/ConfigValidator';

// ============================================================================
// DOM Synchronizers (Language & Theme)
// ============================================================================
const applyLanguageToDOM = (lang: Language) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('lang', lang);
  root.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  if (lang === 'fa') {
    root.classList.add('rtl');
    root.classList.remove('ltr');
  } else {
    root.classList.add('ltr');
    root.classList.remove('rtl');
  }
};

const applyThemeToDOM = (theme: ThemeId) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
};

// ============================================================================
// LocalStorage Persistence Helpers
// ============================================================================
const STORAGE_KEYS = {
  LANGUAGE: 'aegis_vpn_language',
  THEME: 'aegis_vpn_theme',
  CONFIGS: 'aegis_vpn_configs',
  ACTIVE_CONFIG_ID: 'aegis_vpn_active_config_id',
};

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(STORAGE_KEYS.LANGUAGE) as Language | null;
  return saved === 'fa' || saved === 'en' ? saved : 'en';
};

const getInitialTheme = (): ThemeId => {
  if (typeof window === 'undefined') return 'deep-space';
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeId | null;
  const validThemes: ThemeId[] = [
    'neo-ice',
    'neo-mauve',
    'clean-minimal',
    'soft-blue',
    'pearl',
    'morning',
    'deep-space',
    'slate',
    'oled-black',
    'midnight',
    'cyberpunk-neon',
    'aurora-borealis',
    'sunset-gradient',
    'hacker-green',
  ];
  return saved && validThemes.includes(saved) ? saved : 'deep-space';
};

const getInitialConfigs = (): WireguardTunnelConfig[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIGS);
    if (!saved) return []; // STRICT REQUIREMENT: Starts with Empty State
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c: any) => {
      if (!c || typeof c !== 'object') return false;
      const priv = sanitizeWireGuardKey(c.interface?.privateKey);
      const pub = sanitizeWireGuardKey(c.peer?.publicKey);
      return isValidBase64Key(priv, 32) && isValidBase64Key(pub, 32);
    });
  } catch {
    return [];
  }
};

const getInitialActiveConfigId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_CONFIG_ID) || null;
};

// ============================================================================
// Zustand Store Interface
// ============================================================================
export interface AppState {
  // i18n & Theme
  language: Language;
  theme: ThemeId;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  setTheme: (theme: ThemeId) => void;

  // WireGuard Tunnels (Manual configs only)
  configs: WireguardTunnelConfig[];
  activeConfigId: string | null;
  activeConfig: WireguardTunnelConfig | null;
  getActiveConfig: () => WireguardTunnelConfig | null;
  addConfig: (config: Omit<WireguardTunnelConfig, 'id' | 'createdAt'> & { id?: string }) => string;
  updateConfig: (id: string, updates: Partial<WireguardTunnelConfig>) => void;
  removeConfig: (id: string) => void;
  setActiveConfigId: (id: string | null) => void;
  importSampleConfig: () => void;

  // App Foreground / Lifecycle State (Battery Preservation)
  isAppActive: boolean;
  setIsAppActive: (isActive: boolean) => void;

  // Connection State
  connectionState: ConnectionState;
  engineError: string | null;
  setConnectionState: (state: ConnectionState) => void;
  setEngineError: (error: string | null) => void;
  toggleConnection: () => void;

  // Session Statistics
  stats: SessionStats;
  updateStats: (partial: Partial<SessionStats>) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================
export const useAppStore = create<AppState>((set, get) => {
  const initialLang = getInitialLanguage();
  const initialTheme = getInitialTheme();
  const initialConfigs = getInitialConfigs();
  const initialActiveId = getInitialActiveConfigId();
  const validActiveId =
    initialActiveId && initialConfigs.some((c) => c.id === initialActiveId)
      ? initialActiveId
      : initialConfigs[0]?.id ?? null;
  const initialActiveConfig =
    initialConfigs.find((c) => c.id === validActiveId) || initialConfigs[0] || null;

  // Apply initial settings immediately to DOM
  applyLanguageToDOM(initialLang);
  applyThemeToDOM(initialTheme);

  return {
    language: initialLang,
    theme: initialTheme,
    configs: initialConfigs,
    activeConfigId: validActiveId,
    activeConfig: initialActiveConfig,

    getActiveConfig: () => {
      const { configs, activeConfigId } = get();
      return configs.find((c) => c.id === activeConfigId) || configs[0] || null;
    },

    connectionState: 'disconnected',
    engineError: null,
    isAppActive: true,

    stats: {
      downloadSpeed: 0,
      uploadSpeed: 0,
      totalReceived: 0,
      totalSent: 0,
      latencyPing: 0,
      lastHandshake: 0,
      sessionUptime: '00:00:00',
      connectedSince: null,
    },

    setLanguage: (lang: Language) => {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
      applyLanguageToDOM(lang);
      set({ language: lang });
    },

    toggleLanguage: () => {
      const next: Language = get().language === 'en' ? 'fa' : 'en';
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, next);
      applyLanguageToDOM(next);
      set({ language: next });
    },

    setTheme: (theme: ThemeId) => {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      applyThemeToDOM(theme);
      set({ theme });
    },

    addConfig: (configData) => {
      const newId = configData.id || `wg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newConfig: WireguardTunnelConfig = {
        id: newId,
        name: configData.name.trim() || `Tunnel-${newId.slice(-4)}`,
        endpoint: configData.endpoint.trim(),
        interface: configData.interface,
        peer: configData.peer,
        rawConfig: configData.rawConfig,
        createdAt: Date.now(),
      };

      const updatedConfigs = [...get().configs, newConfig];
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.CONFIGS, JSON.stringify(updatedConfigs));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CONFIG_ID, newId);
      }

      set({
        configs: updatedConfigs,
        activeConfigId: newId,
        activeConfig: newConfig,
      });

      return newId;
    },

    updateConfig: (id: string, updates: Partial<WireguardTunnelConfig>) => {
      const updatedConfigs = get().configs.map((c) => (c.id === id ? { ...c, ...updates } : c));
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.CONFIGS, JSON.stringify(updatedConfigs));
      }

      const activeId = get().activeConfigId;
      const isEditingActive = activeId === id || get().activeConfig?.id === id;
      const nextActive = isEditingActive
        ? updatedConfigs.find((c) => c.id === id) || null
        : get().activeConfig;

      set({
        configs: updatedConfigs,
        activeConfig: nextActive,
      });
    },

    removeConfig: (id: string) => {
      const remaining = get().configs.filter((c) => c.id !== id);
      const isRemovingActive = get().activeConfigId === id;
      const nextActive = isRemovingActive ? remaining[0]?.id ?? null : get().activeConfigId;

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.CONFIGS, JSON.stringify(remaining));
        if (nextActive) {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_CONFIG_ID, nextActive);
        } else {
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONFIG_ID);
        }
      }

      // If disconnected or connecting with this config, reset connection
      if (isRemovingActive && get().connectionState !== 'disconnected') {
        set({ connectionState: 'disconnected' });
      }

      const nextActiveConfig = remaining.find((c) => c.id === nextActive) || remaining[0] || null;

      set({
        configs: remaining,
        activeConfigId: nextActive,
        activeConfig: nextActiveConfig,
      });
    },

    setActiveConfigId: (id: string | null) => {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CONFIG_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONFIG_ID);
      }

      const activeConfig = get().configs.find((c) => c.id === id) || null;

      // If we switch active tunnel while connected, disconnect first
      if (get().connectionState === 'connected' && id !== get().activeConfigId) {
        set({
          activeConfigId: id,
          activeConfig,
          connectionState: 'disconnected',
        });
      } else {
        set({
          activeConfigId: id,
          activeConfig,
        });
      }
    },

    importSampleConfig: () => {
      const sample = {
        name: 'Frankfurt-WireGuard-01',
        endpoint: '198.51.100.42:51820',
        interface: {
          address: '10.14.0.2/32',
          dns: '1.1.1.1, 8.8.8.8',
          privateKey: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=',
        },
        peer: {
          endpoint: '198.51.100.42:51820',
          allowedIPs: '0.0.0.0/0, ::/0',
          publicKey: 'p4+N8yK8wM1qW1N9V2v6X7x+K1u9Z4t8Q3b2Y5c6F7A=',
        },
        rawConfig: `[Interface]\nPrivateKey = QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=\nAddress = 10.14.0.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = p4+N8yK8wM1qW1N9V2v6X7x+K1u9Z4t8Q3b2Y5c6F7A=\nEndpoint = 198.51.100.42:51820\nAllowedIPs = 0.0.0.0/0`,
      };
      get().addConfig(sample);
    },

    setIsAppActive: (isActive: boolean) => {
      set({ isAppActive: isActive });
    },

    setConnectionState: (state: ConnectionState) => {
      set({ connectionState: state });
    },

    setEngineError: (error: string | null) => {
      set({ engineError: error });
    },

    toggleConnection: () => {
      const current = get().connectionState;
      const activeId = get().activeConfigId;

      if (!activeId) return;

      if (current === 'connected') {
        // Disconnect
        set({
          connectionState: 'disconnected',
          stats: {
            ...get().stats,
            downloadSpeed: 0,
            uploadSpeed: 0,
            connectedSince: null,
          },
        });
      } else if (current === 'disconnected') {
        // Connect flow: transition state, wait for native or engine telemetry
        set({ connectionState: 'connecting' });
      }
    },

    updateStats: (partial) => {
      set((state) => ({
        stats: { ...state.stats, ...partial },
      }));
    },
  };
});

/**
 * Derived selector hook: Dynamically resolves active config from configs array
 * guarantees instant reactivity when a config name or endpoint is edited.
 */
export const useActiveConfig = (): WireguardTunnelConfig | null => {
  return useAppStore((state) => {
    return state.configs.find((c) => c.id === state.activeConfigId) || state.activeConfig || state.configs[0] || null;
  });
};

