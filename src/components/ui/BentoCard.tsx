import React from 'react';

export interface BentoCardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  colSpan?: string; // e.g., 'col-span-12', 'col-span-12 lg:col-span-6', etc.
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  interactive?: boolean;
  glow?: 'blue' | 'purple' | 'green' | 'none';
  id?: string;
  onClick?: () => void;
}

/**
 * BentoCard (Liquid Glass 2.0 & Dynamic Theme-Synchronized Bento Grid)
 * 
 * - Strictly respects dynamic CSS variables (--bg-surface-glass, --border-glass, --text-primary, etc.)
 * - Adapts seamlessly between Light Minimal, Dark Cyber-Luxe, and OLED Black themes
 * - GPU hardware acceleration via translateZ(0)
 * - Ergonomic rounded-2xl geometry for split-second data scanning
 */
export const BentoCard: React.FC<BentoCardProps> = React.memo(({
  children,
  title,
  subtitle,
  icon,
  badge,
  action,
  colSpan = 'col-span-12',
  className = '',
  headerClassName = '',
  bodyClassName = '',
  interactive = false,
  glow = 'none',
  id,
  onClick,
}) => {
  const glowStyles = {
    none: '',
    blue: 'hover:border-[var(--accent-primary)] hover:shadow-[0_0_24px_var(--accent-glow)]',
    purple: 'hover:border-[var(--accent-secondary)] hover:shadow-[0_0_24px_var(--accent-purple-glow)]',
    green: 'hover:border-[var(--status-connected)] hover:shadow-[0_0_24px_var(--status-connected-glow)]',
  }[glow];

  return (
    <section
      id={id}
      onClick={onClick}
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform, opacity',
        backfaceVisibility: 'hidden',
        backgroundColor: 'var(--bg-surface-glass)',
        borderColor: 'var(--border-glass)',
        color: 'var(--text-primary)',
        boxShadow: 'var(--glass-shadow)',
      }}
      className={`
        bento-card-root
        ${colSpan}
        relative flex flex-col
        rounded-2xl
        border backdrop-blur-2xl
        transition-all duration-200 ease-out
        ${interactive ? 'cursor-pointer hover:border-[var(--border-accent)] hover:scale-[1.006] active:scale-[0.995]' : ''}
        ${glowStyles}
        ${className}
      `}
    >
      {/* Optional Card Header */}
      {(title || icon || badge || action) && (
        <div
          style={{
            borderBottomColor: 'var(--border-subtle)',
          }}
          className={`
            flex items-center justify-between px-5 py-4 border-b
            ${headerClassName}
          `}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3
                  style={{ color: 'var(--text-primary)' }}
                  className="text-xs font-bold uppercase tracking-wider truncate"
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p
                  style={{ color: 'var(--text-muted)' }}
                  className="text-[11px] font-mono truncate"
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {badge && <div>{badge}</div>}
            {action && <div>{action}</div>}
          </div>
        </div>
      )}

      {/* Card Content Body */}
      <div className={`p-5 flex-1 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
});

BentoCard.displayName = 'BentoCard';
