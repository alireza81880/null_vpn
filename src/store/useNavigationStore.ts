import { create } from 'zustand';
import type { NavTab } from '../types/navigation';

interface NavigationState {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentTab: 'dashboard',
  setCurrentTab: (tab: NavTab) => set({ currentTab: tab }),
}));
