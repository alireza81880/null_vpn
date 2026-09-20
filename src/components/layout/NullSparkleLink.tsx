import React from 'react';

export interface NullSparkleLinkProps {
  href: string;
  className?: string;
}

/**
 * NullSparkleLink (Subtle Uiverse-inspired inline sparkle effect)
 * 
 * - Inline text link ("Made by [null]")
 * - Keeps the existing href and click behavior unchanged
 * - Adapts to the active theme palette via CSS variables (--accent-primary, --accent-glow, etc.)
 * - Normal state: elegant purple/violet/accent text, no background box, same size as surrounding text
 * - Hover / Focus: radial glow, mini sparkle stars, animated shimmering text gradient, slight scale (1.03)
 * - Uses pure CSS animation, respects prefers-reduced-motion
 */
export const NullSparkleLink: React.FC<NullSparkleLinkProps> = ({
  href = 'https://alireza81880.github.io/',
  className = '',
}) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`null-sparkle-link group relative inline-flex items-center font-bold tracking-wide outline-none cursor-pointer select-none transition-all duration-300 ${className}`}
      aria-label="Visit author website (opens in new tab)"
    >
      {/* Background Soft Glow Radial Halo (hidden until hover/focus) */}
      <span
        className="null-sparkle-glow absolute -inset-1.5 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300"
        aria-hidden="true"
      />

      {/* Sparkle Particle 1 (Top Right) */}
      <svg
        className="null-sparkle-star star-1 absolute -top-1.5 -right-2 w-2.5 h-2.5 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
      </svg>

      {/* Sparkle Particle 2 (Bottom Left) */}
      <svg
        className="null-sparkle-star star-2 absolute -bottom-1 -left-2 w-2 h-2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
      </svg>

      {/* Main Text with Shimmer Gradient */}
      <span className="null-sparkle-text relative z-10 transition-transform duration-200 group-hover:scale-[1.04] group-focus-visible:scale-[1.04]">
        null
      </span>
    </a>
  );
};
