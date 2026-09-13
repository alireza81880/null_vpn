export type ThemeId = 'deep-space' | 'clean-minimal';

export type ThemeType = 'dark' | 'light';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  type: ThemeType;
  description: string;
  colors: {
    canvas: string;
    surface: string;
    accent: string;
    text: string;
  };
}

export interface ThemeState {
  activeTheme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
}
