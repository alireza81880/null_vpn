import { Home, Globe, BarChart3, Settings } from 'lucide-react';
import type { NavItem } from '../../types/navigation';

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    shortcut: '⌘1',
    description: 'Main status & quick connect',
  },
  {
    id: 'servers',
    label: 'Servers',
    icon: Globe,
    shortcut: '⌘2',
    description: 'Locations & protocol routing',
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: BarChart3,
    shortcut: '⌘3',
    description: 'Bandwidth & session telemetry',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    shortcut: '⌘4',
    description: 'Preferences & theme selection',
  },
];
