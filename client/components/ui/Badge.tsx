'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:
          'border-[var(--color-brand-primary)]/40 bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-secondary)]',
        secondary:
          'border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]',
        success:
          'border-[var(--color-success)]/40 bg-[var(--color-success-bg)] text-[var(--color-success)]',
        warning:
          'border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
        danger:
          'border-[var(--color-error)]/40 bg-[var(--color-error-bg)] text-[var(--color-error)]',
        info: 'border-[var(--color-info)]/40 bg-[var(--color-info-bg)] text-[var(--color-info)]',
        outline:
          'border-[var(--color-border-secondary)] bg-transparent text-[var(--color-text-secondary)]',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** A small leading dot, for status-style badges. */
  dot?: boolean;
}

export function Badge({ className, variant, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
          data-testid="badge-dot"
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

type Status = 'online' | 'offline' | 'busy' | 'away';

const STATUS_CONFIG: Record<Status, { label: string; variant: BadgeProps['variant'] }> = {
  online: { label: 'Online', variant: 'success' },
  offline: { label: 'Offline', variant: 'secondary' },
  busy: { label: 'Busy', variant: 'danger' },
  away: { label: 'Away', variant: 'warning' },
};

export interface StatusBadgeProps {
  status: Status;
  showLabel?: boolean;
  className?: string;
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  const { label, variant } = STATUS_CONFIG[status];

  return (
    <Badge variant={variant} size="sm" dot className={className}>
      {showLabel ? label : null}
    </Badge>
  );
}
