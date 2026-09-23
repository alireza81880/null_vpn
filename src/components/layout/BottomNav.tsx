import React from 'react';
import { Home, Layers, BarChart3, Activity, Settings } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useI18n } from '../../i18n/I18nContext';
import { CircleMenu, CircleMenuItem } from '../ui/CircleMenu';
import type { NavTab } from '../../types/navigation';

/**
 * BottomNav (Circle Menu Radial Navigation)
 * 
 * Refactored to a sleek, compact circular menu:
 * - Collapsed: Floating circular action button displaying current active tab
 * - Expanded: Radial upward semicircle fan-out with tactile spring physics
 * - Seamless integration with Zustand navigation store and i18n
 */
export const BottomNav: React.FC = () => {
  const currentTab = useNavigationStore((state) => state.currentTab);
  const setCurrentTab = useNavigationStore((state) => state.setCurrentTab);
  const { t } = useI18n();

  const menuItems: CircleMenuItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard'),
      icon: <Home className="w-5 h-5" />,
      isActive: currentTab === 'dashboard',
      onClick: () => setCurrentTab('dashboard' as NavTab),
    },
    {
      id: 'servers',
      label: t('nav.tunnels'),
      icon: <Layers className="w-5 h-5" />,
      isActive: currentTab === 'servers',
      onClick: () => setCurrentTab('servers' as NavTab),
    },
    {
      id: 'stats',
      label: t('nav.stats'),
      icon: <BarChart3 className="w-5 h-5" />,
      isActive: currentTab === 'stats',
      onClick: () => setCurrentTab('stats' as NavTab),
    },
    {
      id: 'diagnostics',
      label: t('nav.diagnostics'),
      icon: <Activity className="w-5 h-5" />,
      isActive: currentTab === 'diagnostics',
      onClick: () => setCurrentTab('diagnostics' as NavTab),
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: <Settings className="w-5 h-5" />,
      isActive: currentTab === 'settings',
      onClick: () => setCurrentTab('settings' as NavTab),
    },
  ];

  return (
    <nav
      id="mobile-bottom-circle-nav"
      aria-label="Mobile Navigation"
      className="lg:hidden"
    >
      <CircleMenu
        items={menuItems}
        activeId={currentTab}
        triggerAriaLabel={t('nav.dashboard')}
      />
    </nav>
  );
};

