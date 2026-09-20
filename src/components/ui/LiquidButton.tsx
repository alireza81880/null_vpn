import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'purple' | 'danger' | 'ghost' | 'neumorphic';
  morphology?: 'pill' | 'ergonomic';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  glow?: boolean;
}

/**
 * LiquidButton (2026 Clay Global Engineering Standards)
 * 
 * Implements the 6 Mandatory States:
 * 1. Default: High contrast (meets WCAG 2.2 AAA/AA).
 * 2. Hover: scale-[1.02] with expanded aurora glow and luminous border.
 * 3. Focus: Double-ring outline with 2px gap (focus-visible:ring-2 focus-visible:ring-offset-2).
 * 4. Pressed: scale-[0.98] with reduced/reversed inset shadow.
 * 5. Loading: Zero Layout Shift (replaces icon with microscopic spinner, keeps button dimensions intact).
 * 6. Disabled: Opacity 45%, cursor-not-allowed, inactive pointer events.
 * 
 * Micro-tactility:
 * Inset highlight shadow simulates physical depth: shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]
 * Minimum touch target area: 44x44px.
 */
export const LiquidButton: React.FC<LiquidButtonProps> = ({
  children,
  variant = 'primary',
  morphology = 'pill',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  glow = true,
  className = '',
  type = 'button',
  ...props
}) => {
  const isButtonDisabled = disabled || isLoading;

  // Morphology (Pill vs. Ergonomic 14-16px)
  const morphologyStyles =
    morphology === 'pill'
      ? 'rounded-full'
      : 'rounded-2xl';

  // Sizing & Minimum Touch Target Area (44x44px min touch target)
  const sizeStyles = {
    sm: 'min-h-[44px] px-4 py-2 text-xs gap-2',
    md: 'min-h-[44px] h-11 px-5 py-2.5 text-sm gap-2.5',
    lg: 'min-h-[48px] h-12 px-7 py-3 text-base gap-3 font-semibold tracking-wide',
    icon: 'min-h-[44px] min-w-[44px] w-11 h-11 p-0 flex items-center justify-center',
  }[size];

  // Micro-tactility, Inset Highlights, and 6-State Styling
  const variantStyles = {
    primary: [
      // Dynamic Theme-Aware Primary Token
      'bg-[var(--accent-primary)] text-[var(--accent-foreground,#ffffff)]',
      'border border-[var(--border-accent)]',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_4px_20px_-2px_var(--accent-glow)]',
      glow ? 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_28px_var(--accent-glow)]' : '',
      'hover:opacity-95 hover:border-[var(--border-glass)]',
      'active:opacity-90 active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]',
      'focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-canvas)]',
    ].filter(Boolean).join(' '),

    purple: [
      // Cyber Purple (#8B5CF6)
      'bg-purple-600 text-white',
      'border border-purple-400/40',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_4px_20px_-2px_rgba(139,92,246,0.5)]',
      glow ? 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_28px_rgba(139,92,246,0.65)]' : '',
      'hover:bg-purple-500 hover:border-purple-300/60',
      'active:bg-purple-700 active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]',
      'focus-visible:ring-purple-400 focus-visible:ring-offset-[#0A0C10]',
    ].filter(Boolean).join(' '),

    secondary: [
      // Dynamic Surface with Adaptive Glass Border
      'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] backdrop-blur-xl',
      'border border-[var(--border-glass)]',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(0,0,0,0.15)]',
      'hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]',
      glow ? 'hover:shadow-[0_0_20px_var(--accent-glow)]' : '',
      'active:bg-[var(--bg-surface)] active:scale-[0.98]',
      'focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2',
    ].filter(Boolean).join(' '),

    danger: [
      // Emergency / Disconnect Crimson
      'bg-rose-600/90 text-white backdrop-blur-lg',
      'border border-rose-400/40',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_20px_-2px_rgba(225,29,72,0.45)]',
      glow ? 'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_28px_rgba(225,29,72,0.6)]' : '',
      'hover:bg-rose-500 hover:border-rose-300/60',
      'active:bg-rose-700 active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]',
      'focus-visible:ring-rose-400 focus-visible:ring-offset-2',
    ].filter(Boolean).join(' '),

    ghost: [
      'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      'border border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]',
      'active:bg-[var(--bg-surface-elevated)]',
      'focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2',
    ].join(' '),

    neumorphic: [
      // Tactile Soft UI Neumorphic Button
      'bg-[var(--bg-surface)] text-[var(--text-primary)]',
      'border border-[var(--border-subtle)]',
      'shadow-[var(--neo-raised)]',
      'hover:brightness-105 hover:shadow-[var(--neo-raised-lg)]',
      'active:shadow-[var(--neo-pressed)] active:translate-y-[1px]',
      'focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-canvas)]',
    ].join(' '),
  }[variant];

  return (
    <button
      type={type}
      disabled={isButtonDisabled}
      className={`
        relative inline-flex items-center justify-center select-none font-medium
        transition-all duration-200 ease-out outline-none
        ${morphologyStyles}
        ${sizeStyles}
        ${variantStyles}
        ${
          !isButtonDisabled
            ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
            : 'opacity-45 cursor-not-allowed pointer-events-none'
        }
        focus-visible:ring-2 focus-visible:ring-offset-2
        ${className}
      `}
      {...props}
    >
      {/* Zero Layout Shift: Microscopic Spinner replaces or accompanies icon */}
      {isLoading ? (
        <span className="inline-flex items-center justify-center shrink-0 w-4 h-4">
          <Loader2 className="w-4 h-4 animate-micro-spin" aria-hidden="true" />
        </span>
      ) : icon && iconPosition === 'left' ? (
        <span className="inline-flex items-center justify-center shrink-0 w-4 h-4">
          {icon}
        </span>
      ) : null}

      {/* Button Text (1-3 Action-Oriented Words) */}
      {children && (
        <span className="truncate leading-none">
          {children}
        </span>
      )}

      {!isLoading && icon && iconPosition === 'right' ? (
        <span className="inline-flex items-center justify-center shrink-0 w-4 h-4">
          {icon}
        </span>
      ) : null}
    </button>
  );
};
