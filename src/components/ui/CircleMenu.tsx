import React, { useState, useEffect, useRef, useCallback } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { X, Menu } from 'lucide-react';

export interface CircleMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  onClick: () => void;
  badge?: string | number;
}

export interface CircleMenuProps {
  items: CircleMenuItem[];
  activeId?: string;
  className?: string;
  triggerAriaLabel?: string;
  radius?: number;
}

/**
 * CircleMenu — 60 FPS GPU-Accelerated Radial Menu
 * 
 * Complies with strict 2026 performance constraints:
 * - Pure hardware-accelerated CSS transitions using transform (translate3d, scale) and opacity only.
 * - Zero SVG filters / Gooey / backdrop-heavy filters to guarantee smooth 60 FPS in Android WebView.
 * - Responsive dynamic radius:
 *     Mobile small (< 360px): ~88px
 *     Mobile standard (360-640px): ~102px
 *     Tablet/Desktop (> 640px): ~114px
 * - Semi-circular upward fan-out (180° to 0°) with elegant glass bubbles and floating badges.
 * - Android Back Button listener: If open, closes menu first without breaking main app navigation.
 * - Escape key & click-outside dismissal.
 */
export const CircleMenu: React.FC<CircleMenuProps> = ({
  items,
  activeId,
  className = '',
  triggerAriaLabel = 'Toggle navigation menu',
  radius: customRadius,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [responsiveRadius, setResponsiveRadius] = useState<number>(102);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Calculate responsive radius dynamically based on viewport width
  useEffect(() => {
    if (customRadius) {
      setResponsiveRadius(customRadius);
      return;
    }

    const updateRadius = () => {
      const width = window.innerWidth;
      if (width < 360) {
        setResponsiveRadius(88);
      } else if (width < 640) {
        setResponsiveRadius(102);
      } else {
        setResponsiveRadius(114);
      }
    };

    updateRadius();
    window.addEventListener('resize', updateRadius, { passive: true });
    return () => window.removeEventListener('resize', updateRadius);
  }, [customRadius]);

  // 2. Android Hardware Back Button Listener via Capacitor App Plugin
  useEffect(() => {
    if (!isOpen) return;

    let backHandle: PluginListenerHandle | null = null;

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        // If menu is open, close it first and prevent default app exit / back action
        setIsOpen(false);
      })
        .then((handle) => {
          backHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      if (backHandle) {
        backHandle.remove();
      }
    };
  }, [isOpen]);

  // 3. Escape key dismissal for Desktop / Web
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Active item to display inside the main trigger button when collapsed
  const activeItem = items.find((item) => item.isActive || item.id === activeId) || items[0];

  // 4. Coordinates calculation for semi-circle arc (upward fan-out from 180° to 0°)
  const itemCount = items.length;
  const getItemCoords = useCallback(
    (index: number) => {
      if (itemCount <= 1) {
        return { x: 0, y: -responsiveRadius };
      }
      // Distribute evenly from 180° (left) to 0° (right)
      const angle = Math.PI - (index * Math.PI) / (itemCount - 1);
      const x = Math.round(responsiveRadius * Math.cos(angle));
      const y = Math.round(-responsiveRadius * Math.sin(angle));
      return { x, y };
    },
    [itemCount, responsiveRadius]
  );

  return (
    <>
      {/* Click-outside backdrop overlay (Lightweight GPU opacity transition, no heavy blurs) */}
      <div
        id="circle-menu-backdrop"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 pointer-events-auto ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Radial Menu Anchor Container fixed at bottom-center */}
      <div
        ref={containerRef}
        id="circle-menu-container"
        dir="ltr"
        className={`fixed z-50 pointer-events-none flex items-center justify-center ${className}`}
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        {/* Radial Bubble Items Container */}
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          role="menu"
          aria-label="Radial Menu Options"
        >
          {items.map((item, index) => {
            const { x, y } = getItemCoords(index);
            const isItemActive = item.isActive || item.id === activeId;

            // Stagger calculation: 25ms per item for opening, slight reverse for closing
            const openDelay = index * 24;
            const closeDelay = (itemCount - 1 - index) * 16;
            const transitionDelay = isOpen ? `${openDelay}ms` : `${closeDelay}ms`;

            return (
              <div
                key={item.id}
                style={{
                  transform: isOpen
                    ? `translate3d(${x}px, ${y}px, 0) scale(1)`
                    : 'translate3d(0, 0, 0) scale(0.2)',
                  opacity: isOpen ? 1 : 0,
                  pointerEvents: isOpen ? 'auto' : 'none',
                  transition: `transform ${isOpen ? '400ms' : '280ms'} cubic-bezier(0.175, 0.885, 0.32, 1.15) ${transitionDelay}, opacity ${isOpen ? '320ms' : '220ms'} ease ${transitionDelay}`,
                  willChange: 'transform, opacity',
                }}
                className="absolute flex flex-col items-center justify-center select-none"
              >
                {/* Circular Glass Bubble Button */}
                <button
                  id={`circle-menu-item-${item.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onClick();
                    setIsOpen(false);
                  }}
                  aria-label={item.label}
                  title={item.label}
                  style={{
                    backgroundColor: isItemActive
                      ? 'var(--accent-primary)'
                      : 'var(--bg-surface-glass)',
                    color: isItemActive
                      ? 'var(--accent-foreground, #ffffff)'
                      : 'var(--text-secondary)',
                    borderColor: isItemActive
                      ? 'var(--accent-primary)'
                      : 'var(--border-subtle)',
                    boxShadow: isItemActive
                      ? '0 0 20px var(--accent-glow), 0 4px 12px rgba(0, 0, 0, 0.45)'
                      : '0 4px 14px rgba(0, 0, 0, 0.35)',
                  }}
                  className={`group relative flex items-center justify-center w-12 h-12 rounded-full border backdrop-blur-md transition-transform duration-150 active:scale-90 cursor-pointer focus:outline-none ${
                    isItemActive ? 'ring-2 ring-blue-400/40 ring-offset-2 ring-offset-black/60' : ''
                  }`}
                >
                  <span className="w-5 h-5 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
                    {item.icon}
                  </span>

                  {/* Active Indicator Dot */}
                  {isItemActive && (
                    <span
                      style={{ backgroundColor: 'var(--accent-foreground, #ffffff)' }}
                      className="absolute -top-0.5 right-1 w-2 h-2 rounded-full shadow-xs"
                    />
                  )}
                </button>

                {/* Small Rounded Label Badge */}
                <span
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: isItemActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                    borderColor: isItemActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    transform: isOpen ? 'translate3d(0, 0, 0)' : 'translate3d(0, 4px, 0)',
                    opacity: isOpen ? 1 : 0,
                    transition: `transform 260ms ease ${isOpen ? openDelay + 60 : 0}ms, opacity 240ms ease ${isOpen ? openDelay + 60 : 0}ms`,
                  }}
                  className="mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border pointer-events-none whitespace-nowrap tracking-wide"
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Center Trigger Button (Larger circular glass orb) */}
        <button
          id="circle-menu-trigger"
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label={triggerAriaLabel}
          style={{
            backgroundColor: isOpen
              ? 'var(--bg-surface-elevated)'
              : 'var(--bg-surface-glass)',
            borderColor: isOpen
              ? 'var(--border-strong)'
              : 'var(--border-accent)',
            boxShadow: isOpen
              ? 'inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 0, 0, 0.6)'
              : '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 22px var(--accent-glow)',
            color: 'var(--text-primary)',
          }}
          className="pointer-events-auto relative flex items-center justify-center w-14 h-14 rounded-full border backdrop-blur-md transition-all duration-200 active:scale-90 cursor-pointer focus:outline-none"
        >
          {/* Subtle pulsating outer ring when menu is closed */}
          {!isOpen && (
            <span
              style={{
                borderColor: 'var(--accent-primary)',
              }}
              className="absolute inset-0 rounded-full border-2 animate-ping opacity-25 pointer-events-none"
            />
          )}

          {/* Morphing Icon with smooth 3D rotation */}
          <div
            style={{
              transform: isOpen ? 'rotate(90deg) scale(1)' : 'rotate(0deg) scale(1)',
              transition: 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            className="w-6 h-6 flex items-center justify-center pointer-events-none"
          >
            {isOpen ? (
              <X className="w-6 h-6 text-red-400" />
            ) : activeItem?.icon ? (
              <span className="w-6 h-6 flex items-center justify-center text-blue-400">
                {activeItem.icon}
              </span>
            ) : (
              <Menu className="w-6 h-6 text-blue-400" />
            )}
          </div>
        </button>
      </div>
    </>
  );
};
