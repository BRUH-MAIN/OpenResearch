import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ 
  children, 
  className = '', 
  variant = 'default',
  hover = false, 
  onClick 
}: CardProps) {
  const baseStyles = 'rounded-xl transition-all duration-200';
  
  const variants = {
    default: 'bg-[#1a1a1a] border border-[#2a2a2a]',
    elevated: 'bg-[#242424] border border-[#3a3a3a] shadow-lg shadow-black/20',
    outlined: 'bg-transparent border-2 border-[#0D7377]/50',
    glass: 'bg-[#1a1a1a]/80 backdrop-blur-xl border border-[#2a2a2a]/50',
  };
  
  const hoverStyles = hover 
    ? 'cursor-pointer hover:border-[#0D7377]/60 hover:shadow-xl hover:shadow-[#0D7377]/10 hover:-translate-y-1 active:translate-y-0 active:shadow-md' 
    : '';
  
  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${hoverStyles} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function CardHeader({ children, className = '', action }: CardHeaderProps) {
  return (
    <div className={`px-5 py-4 border-b border-[#2a2a2a]/60 ${action ? 'flex items-center justify-between' : ''} ${className}`}>
      <div className="flex-1">{children}</div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`px-5 py-4 border-t border-[#2a2a2a]/60 bg-[#151515]/50 rounded-b-xl ${className}`}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold text-white ${className}`}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return (
    <p className={`text-sm text-[#a1a1aa] mt-1 ${className}`}>
      {children}
    </p>
  );
}
