import { create } from 'zustand';
import { useAppStore } from './useAppStore';

export type ThemeCategory = 'light' | 'dark' | 'premium';

export interface ThemeMeta {
  id: string;
  name: string;
  category: ThemeCategory;
  primaryColor: string;
  surfaceColor: string;
  canvasColor: string;
  accentGlow: string;
  description: string;
}

export const THEME_REGISTRY: ThemeMeta[] = [
  // 4 Light Themes
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    category: 'light',
    primaryColor: '#4f46e5',
    surfaceColor: '#ffffff',
    canvasColor: '#f8fafc',
    accentGlow: 'rgba(79, 70, 229, 0.28)',
    description: 'Crisp, high-contrast monochrome light interface',
  },
  {
    id: 'soft-blue',
    name: 'Soft Blue',
    category: 'light',
    primaryColor: '#0284c7',
    surfaceColor: '#ffffff',
    canvasColor: '#f0f7ff',
    accentGlow: 'rgba(2, 132, 199, 0.3)',
    description: 'Serene cyan-tinted atmospheric light aesthetic',
  },
  {
    id: 'pearl',
    name: 'Pearl Warm',
    category: 'light',
    primaryColor: '#b45309',
    surfaceColor: '#ffffff',
    canvasColor: '#faf8f5',
    accentGlow: 'rgba(180, 83, 9, 0.28)',
    description: 'Warm cream paper tone with amber accents',
  },
  {
    id: 'morning',
    name: 'Morning Glow',
    category: 'light',
    primaryColor: '#f59e0b',
    surfaceColor: '#ffffff',
    canvasColor: '#fffdf5',
    accentGlow: 'rgba(245, 158, 11, 0.32)',
    description: 'Energetic dawn gold with sunny highlights',
  },

  // 4 Dark Themes
  {
    id: 'deep-space',
    name: 'Deep Space',
    category: 'dark',
    primaryColor: '#6366f1',
    surfaceColor: '#0e1626',
    canvasColor: '#090d16',
    accentGlow: 'rgba(99, 102, 241, 0.4)',
    description: 'Signature cosmic navy with indigo neon highlights',
  },
  {
    id: 'slate',
    name: 'Dark Slate',
    category: 'dark',
    primaryColor: '#0ea5e9',
    surfaceColor: '#1e293b',
    canvasColor: '#0f172a',
    accentGlow: 'rgba(14, 165, 233, 0.4)',
    description: 'Cool industrial steel and cerulean blue',
  },
  {
    id: 'oled-black',
    name: 'OLED Pure Black',
    category: 'dark',
    primaryColor: '#ffffff',
    surfaceColor: '#0a0a0a',
    canvasColor: '#000000',
    accentGlow: 'rgba(255, 255, 255, 0.35)',
    description: 'True 0% black battery-saving stark monochrome',
  },
  {
    id: 'midnight',
    name: 'Midnight Indigo',
    category: 'dark',
    primaryColor: '#818cf8',
    surfaceColor: '#090e24',
    canvasColor: '#020617',
    accentGlow: 'rgba(129, 140, 248, 0.4)',
    description: 'Velvet nocturne with glowing lavender lines',
  },

  // 4 Premium Themes
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    category: 'premium',
    primaryColor: '#ff003c',
    surfaceColor: '#18181b',
    canvasColor: '#09090b',
    accentGlow: 'rgba(255, 0, 60, 0.55)',
    description: 'Electric crimson & cyan high-tech wireframe glow',
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    category: 'premium',
    primaryColor: '#6ee7b7',
    surfaceColor: '#033a2e',
    canvasColor: '#022c22',
    accentGlow: 'rgba(110, 231, 183, 0.5)',
    description: 'Nordic emerald night with ethereal purple shimmer',
  },
  {
    id: 'sunset-gradient',
    name: 'Sunset Gradient',
    category: 'premium',
    primaryColor: '#f97316',
    surfaceColor: '#1e0e22',
    canvasColor: '#120914',
    accentGlow: 'rgba(249, 115, 22, 0.45)',
    description: 'Warm dusk magenta and radiant amber fire',
  },
  {
    id: 'hacker-green',
    name: 'Hacker Matrix',
    category: 'premium',
    primaryColor: '#22c55e',
    surfaceColor: '#07170a',
    canvasColor: '#030a04',
    accentGlow: 'rgba(34, 197, 94, 0.65)',
    description: 'Terminal phosphor green with dark cyber stealth',
  },
];

const THEME_STORAGE_KEY = 'aegis_vpn_theme';

const getInitialTheme = (): string => {
  if (typeof window === 'undefined') return 'deep-space';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEME_REGISTRY.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'deep-space';
};

const applyThemeToDOM = (themeId: string) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', themeId);
};

// Immediate hydration of DOM data-theme on load
if (typeof document !== 'undefined') {
  const initial = getInitialTheme();
  applyThemeToDOM(initial);
}

export interface ThemeStore {
  activeTheme: string;
  setTheme: (themeId: string) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  activeTheme: getInitialTheme(),
  setTheme: (themeId: string) => {
    applyThemeToDOM(themeId);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themeId);
      } catch {
        // ignore
      }
    }
    // Also sync to useAppStore if active
    try {
      useAppStore.getState().setTheme(themeId as any);
    } catch {
      // ignore
    }
    set({ activeTheme: themeId });
  },
}));
