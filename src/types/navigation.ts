import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export type NavTab = 'dashboard' | 'servers' | 'stats' | 'diagnostics' | 'settings';

export interface NavItem {
  id: NavTab;
  label: string;
  icon: ComponentType<LucideProps>;
  badge?: string | number;
  shortcut?: string;
  description?: string;
}
