import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  const isDisabled = disabled || isLoading;

  // Use inline styles to reference CSS vars (Tailwind can't resolve CSS vars at build time)
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))',
      color: '#fff',
      boxShadow: 'var(--shadow-glow)',
    },
    secondary: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border-secondary)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-brand-secondary)',
      border: '2px solid var(--color-brand-primary)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
    },
    danger: {
      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
      color: '#fff',
      boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.25)',
    },
  };

  return (
    <button
      className={`
        relative inline-flex items-center justify-center
        font-semibold rounded-xl
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        active:scale-[0.98]
        ${sizes[size]} ${className}
      `}
      style={variantStyles[variant]}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 size={iconSizes[size]} className="animate-spin" />
          <span className="ml-1">Loading...</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
