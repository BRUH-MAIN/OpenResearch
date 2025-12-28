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
  const baseStyles = 'inline-flex items-center font-medium rounded-full transition-colors';
  
  const variants = {
    primary: 'bg-[#0D7377]/20 text-[#14FFEC] border border-[#0D7377]/40',
    secondary: 'bg-[#242424] text-[#a1a1aa] border border-[#3a3a3a]',
    success: 'bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30',
    warning: 'bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30',
    danger: 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30',
    info: 'bg-[#3b82f6]/15 text-[#60a5fa] border border-[#3b82f6]/30',
    outline: 'bg-transparent text-[#a1a1aa] border border-[#3a3a3a] hover:border-[#0D7377]/60 hover:text-[#14FFEC]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  const dotColors = {
    primary: 'bg-[#14FFEC]',
    secondary: 'bg-[#71717a]',
    success: 'bg-[#22c55e]',
    warning: 'bg-[#f59e0b]',
    danger: 'bg-[#ef4444]',
    info: 'bg-[#3b82f6]',
    outline: 'bg-[#71717a]',
  };
  
  return (
    <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-pulse`} />
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
    online: { color: 'bg-[#22c55e]', label: 'Online', variant: 'success' as const },
    offline: { color: 'bg-[#71717a]', label: 'Offline', variant: 'secondary' as const },
    busy: { color: 'bg-[#ef4444]', label: 'Busy', variant: 'danger' as const },
    away: { color: 'bg-[#f59e0b]', label: 'Away', variant: 'warning' as const },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} size="sm" dot className={className}>
      {showLabel && config.label}
    </Badge>
  );
}
