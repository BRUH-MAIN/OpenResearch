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
  const baseStyles = `
    relative inline-flex items-center justify-center
    font-semibold rounded-xl
    transition-all duration-200 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14FFEC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.98]
  `;
  
  const variants = {
    primary: `
      bg-gradient-to-r from-[#0D7377] to-[#0a8f8f]
      text-white
      shadow-md shadow-[#0D7377]/25
      hover:shadow-lg hover:shadow-[#0D7377]/40 hover:from-[#0a8f8f] hover:to-[#0D7377]
      active:shadow-sm
    `,
    secondary: `
      bg-[#242424] text-white
      border border-[#3a3a3a]
      hover:bg-[#2a2a2a] hover:border-[#4a4a4a]
      active:bg-[#1a1a1a]
    `,
    outline: `
      bg-transparent
      border-2 border-[#0D7377] text-[#14FFEC]
      hover:bg-[#0D7377]/10 hover:border-[#14FFEC]
      active:bg-[#0D7377]/20
    `,
    ghost: `
      bg-transparent text-[#a1a1aa]
      hover:bg-[#242424] hover:text-white
      active:bg-[#2a2a2a]
    `,
    danger: `
      bg-gradient-to-r from-[#dc2626] to-[#b91c1c]
      text-white
      shadow-md shadow-red-500/25
      hover:shadow-lg hover:shadow-red-500/40
      active:shadow-sm
    `,
  };
  
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
  
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
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
