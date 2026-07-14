'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Aceternity-style aurora background.
 *
 * Deliberately CSS-only — the drifting gradient is a compositor-friendly
 * `background-position` animation, not a JS render loop, so it costs nothing on
 * the main thread. It is used on the landing page and nowhere else: inside the
 * research workspace, moving colour behind dense text is a distraction, not a
 * feature.
 *
 * It also respects `prefers-reduced-motion`, which is a real requirement and not
 * a nicety — animated gradients are a migraine trigger for some people.
 */
export function AuroraBackground({
  children,
  className,
  showRadialMask = true,
}: {
  children: React.ReactNode;
  className?: string;
  showRadialMask?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden bg-[var(--color-bg-primary)]',
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-[10px] opacity-50 blur-[10px] will-change-transform',
          'aurora-layer',
          showRadialMask && '[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]'
        )}
      />
      {children}
    </div>
  );
}
