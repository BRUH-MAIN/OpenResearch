import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  children, 
  ...props 
}: ButtonProps) {
  const baseStyles = 'font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[#0D7377] text-white hover:bg-[#0a5a5d] active:bg-[#084648]',
    secondary: 'bg-[#323232] text-white hover:bg-[#3d3d3d] active:bg-[#2a2a2a]',
    outline: 'border-2 border-[#0D7377] text-[#14FFEC] hover:bg-[#0D7377]/10 active:bg-[#0D7377]/20',
    ghost: 'text-gray-300 hover:bg-[#323232] active:bg-[#3d3d3d]',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
