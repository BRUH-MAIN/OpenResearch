'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'primary',
  size = 'md',
  dot = false,
  className = ''
}: BadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  const getVariantStyles = (variant: string) => {
    switch (variant) {
      case 'primary':
        return {
          background: 'rgba(13, 115, 119, 0.15)',
          color: 'var(--color-brand-secondary)',
          border: '1px solid rgba(13, 115, 119, 0.3)',
        };
      case 'secondary':
        return {
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-secondary)',
        };
      case 'success':
        return {
          background: 'var(--color-success-bg)',
          color: 'var(--color-success)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
        };
      case 'warning':
        return {
          background: 'var(--color-warning-bg)',
          color: 'var(--color-warning)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        };
      case 'danger':
        return {
          background: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        };
      case 'info':
        return {
          background: 'var(--color-info-bg)',
          color: 'var(--color-info)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-secondary)',
        };
      default:
        return {};
    }
  };

  const getDotColor = (variant: string) => {
    switch (variant) {
      case 'primary': return 'var(--color-brand-secondary)';
      case 'secondary': return 'var(--color-text-muted)';
      case 'success': return 'var(--color-success)';
      case 'warning': return 'var(--color-warning)';
      case 'danger': return 'var(--color-error)';
      case 'info': return 'var(--color-info)';
      default: return 'var(--color-text-muted)';
    }
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full transition-colors ${sizes[size]} ${className}`}
      style={getVariantStyles(variant)}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: getDotColor(variant) }}
        />
      )}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'busy' | 'away';
  showLabel?: boolean;
  className?: string;
}

export function StatusBadge({ status, showLabel = true, className = '' }: StatusBadgeProps) {
  const statusConfig = {
    online: { label: 'Online', variant: 'success' as const },
    offline: { label: 'Offline', variant: 'secondary' as const },
    busy: { label: 'Busy', variant: 'danger' as const },
    away: { label: 'Away', variant: 'warning' as const },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} size="sm" dot className={className}>
      {showLabel && config.label}
    </Badge>
  );
}
