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
  const baseStyles: React.CSSProperties = {
    borderRadius: 'var(--radius-xl)',
    transition: 'all var(--transition-base)',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border-primary)',
    },
    elevated: {
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border-secondary)',
      boxShadow: 'var(--shadow-lg)',
    },
    outlined: {
      background: 'transparent',
      border: '2px solid var(--color-border-accent)',
    },
    glass: {
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--color-border-primary)',
    },
  };

  return (
    <div
      className={`${hover ? 'cursor-pointer card-interactive' : ''} ${className}`}
      style={{ ...baseStyles, ...variantStyles[variant] }}
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
    <div
      className={`px-5 py-4 border-b ${action ? 'flex items-center justify-between' : ''} ${className}`}
      style={{ borderColor: 'var(--color-border-primary)' }}
    >
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
    <div
      className={`px-5 py-4 border-t ${className}`}
      style={{
        borderColor: 'var(--color-border-primary)',
        background: 'var(--color-bg-tertiary)',
        borderBottomLeftRadius: 'var(--radius-xl)',
        borderBottomRightRadius: 'var(--radius-xl)',
      }}
    >
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
    <h3
      className={`text-lg font-semibold ${className}`}
      style={{ color: 'var(--color-text-primary)' }}
    >
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
    <p
      className={`text-sm mt-1 ${className}`}
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {children}
    </p>
  );
}
