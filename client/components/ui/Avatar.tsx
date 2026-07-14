'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/lib/utils';

/**
 * Avatar, on Radix.
 *
 * The point of the primitive is the fallback: Radix tracks the image's load
 * state, so a broken or slow avatar URL shows initials instead of a broken-image
 * icon or an empty box.
 */

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-20 w-20 text-xl',
} as const;

const STATUS_COLOR = {
  online: 'bg-[var(--color-success)]',
  offline: 'bg-[var(--color-text-muted)]',
  busy: 'bg-[var(--color-error)]',
  away: 'bg-[var(--color-warning)]',
} as const;

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface AvatarProps {
  src?: string;
  alt: string;
  size?: keyof typeof SIZES;
  status?: keyof typeof STATUS_COLOR;
  className?: string;
}

export function Avatar({ src, alt, size = 'md', status, className }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <AvatarPrimitive.Root
        className={cn(
          'inline-flex select-none items-center justify-center overflow-hidden rounded-full',
          'border border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]',
          SIZES[size]
        )}
      >
        {src && (
          <AvatarPrimitive.Image
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
          />
        )}
        <AvatarPrimitive.Fallback
          delayMs={src ? 300 : 0}
          className="flex h-full w-full items-center justify-center font-medium text-[var(--color-text-secondary)]"
        >
          {initials(alt)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-bg-primary)]',
            STATUS_COLOR[status]
          )}
          aria-label={status}
        />
      )}
    </span>
  );
}

export interface AvatarGroupProps {
  avatars: { src?: string; alt: string }[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = 'md', className }: AvatarGroupProps) {
  const shown = avatars.slice(0, max);
  const remaining = avatars.length - max;

  const overlap = { sm: '-ml-2', md: '-ml-3', lg: '-ml-4' }[size];

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((avatar, index) => (
        <div
          key={`${avatar.alt}-${index}`}
          className={cn('ring-2 ring-[var(--color-bg-primary)] rounded-full', index > 0 && overlap)}
        >
          <Avatar src={avatar.src} alt={avatar.alt} size={size} />
        </div>
      ))}

      {remaining > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full ring-2 ring-[var(--color-bg-primary)]',
            'border border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]',
            'text-xs font-medium text-[var(--color-text-secondary)]',
            SIZES[size],
            overlap
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
