'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-2xl transition-all', {
  variants: {
    variant: {
      default:
        'bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]',
      elevated:
        'bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] shadow-lg',
      outlined: 'bg-transparent border border-[var(--color-border-secondary)]',
      glass:
        'bg-[var(--glass-bg)] border border-[var(--color-border-primary)] backdrop-blur-xl',
    },
    hover: {
      true: 'cursor-pointer hover:border-[var(--color-border-accent)] hover:-translate-y-0.5 hover:shadow-xl',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', hover: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, hover, onClick, ...props }: CardProps) {
  // A clickable card must be reachable and operable by keyboard, not just by
  // mouse — so when it takes an onClick it announces itself as a button.
  const interactive = !!onClick;

  return (
    <div
      className={cn(cardVariants({ variant, hover: hover ?? interactive }), className)}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                (event.currentTarget as HTMLElement).click();
              }
            }
          : undefined
      }
      {...props}
    />
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rendered on the right of the header — usually a button or menu. */
  action?: React.ReactNode;
}

export function CardHeader({ className, action, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'p-5 border-b border-[var(--color-border-primary)]',
        action && 'flex items-center justify-between',
        className
      )}
      {...props}
    >
      <div className="flex-1 flex flex-col gap-1.5">{children}</div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}

/** Named CardBody, not CardContent: it is what the app already calls it. */
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-5 pt-0 border-t border-[var(--color-border-primary)]',
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold leading-none text-[var(--color-text-primary)]',
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-[var(--color-text-secondary)]', className)} {...props} />
  );
}
