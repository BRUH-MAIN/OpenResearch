'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * shadcn-style button: variants declared once with `cva`, and `asChild` so a
 * Button can *be* a Link rather than wrapping one (no <a> inside a <button>).
 *
 * The variant and size names are the ones the app already used, so this changes
 * the internals, not the call sites.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl',
    'text-sm font-medium transition-all cursor-pointer',
    'disabled:pointer-events-none disabled:opacity-50',
    // A visible focus ring, not a removed outline: keyboard users need to see
    // where they are.
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] text-[var(--color-bg-primary)] font-semibold shadow-lg hover:brightness-110 active:brightness-95',
        secondary:
          'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-hover)]',
        outline:
          'border border-[var(--color-border-secondary)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-brand-secondary)] hover:bg-[var(--color-bg-tertiary)]',
        ghost:
          'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]',
        danger: 'bg-[var(--color-error)] text-white hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className,
  variant,
  size,
  isLoading = false,
  asChild = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {rightIcon}
    </Comp>
  );
}

export { buttonVariants };
