/**
 * Battery Optimization & App Lifecycle Hook (src/hooks/useAppLifecycle.ts)
 * 
 * Complies with strict 2026 mobile battery standards.
 * Intercepts OS lifecycle events via `@capacitor/app` and HTML5 Page Visibility API:
 * 
 * 1. Background State (`isActive: false`):
 *    - Pauses high-frequency UI timers, polling loops, canvas renders, and Framer Motion loops.
 *    - Sets global `isAppActive: false` in Zustand so telemetry listeners suspend execution.
 *    - Leaves ONLY the native OS VPN daemon (Android VpnService / iOS NetworkExtension)
 *      running with zero JavaScript CPU consumption.
 * 
 * 2. Foreground State (`isActive: true`):
 *    - Resumes UI animations, re-enables real-time telemetry streaming, and re-syncs tunnel stats.
 */

import { useEffect, useState } from 'react';
import { App as CapacitorApp, AppState as CapAppState } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { useAppStore } from '../store/useAppStore';

export interface AppLifecycleState {
  /**
   * Whether the application UI is active and visible in the foreground
   */
  isAppActive: boolean;
  /**
   * Timestamp of the last lifecycle state transition
   */
  lastStateChange: number;
}

export function useAppLifecycle(): AppLifecycleState {
  const [isForeground, setIsForeground] = useState<boolean>(true);
  const [lastStateChange, setLastStateChange] = useState<number>(Date.now());
  const setIsAppActive = useAppStore((state) => state.setIsAppActive);

  useEffect(() => {
    let appStateHandle: PluginListenerHandle | null = null;

    const handleActiveStateChange = (isActive: boolean) => {
      setIsForeground(isActive);
      setLastStateChange(Date.now());
      setIsAppActive(isActive);
    };

    // 1. Mobile Lifecycle via @capacitor/app
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', (state: CapAppState) => {
        handleActiveStateChange(state.isActive);
      })
        .then((handle) => {
          appStateHandle = handle;
        })
        .catch((err) => {
          console.warn('[useAppLifecycle] Failed to attach @capacitor/app listener:', err);
        });
    }

    // 2. Web / Electron Lifecycle via standard Document Visibility & Focus APIs
    const onVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      handleActiveStateChange(isVisible);
    };

    const onWindowBlur = () => {
      // In Electron / Desktop, window blur indicates user switched apps
      if (document.hidden) {
        handleActiveStateChange(false);
      }
    };

    const onWindowFocus = () => {
      handleActiveStateChange(true);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);

    // Initial check
    if (document.hidden) {
      handleActiveStateChange(false);
    }

    return () => {
      if (appStateHandle) {
        appStateHandle.remove();
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [setIsAppActive]);

  return {
    isAppActive: isForeground,
    lastStateChange,
  };
}
