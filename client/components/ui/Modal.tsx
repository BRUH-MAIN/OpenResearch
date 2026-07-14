'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Modal, on Radix Dialog.
 *
 * The API is unchanged (isOpen / onClose / title / footer / size), but the
 * behaviour it was hand-rolling is now Radix's problem — and Radix does it
 * properly: focus is trapped inside the dialog and restored to the trigger on
 * close, the page behind it is inert and scroll-locked, Escape closes, and it is
 * announced to screen readers as a dialog with a title.
 */

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
} as const;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizeClasses;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className,
  bodyClassName,
  footerClassName,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          aria-hidden="true"
          data-slot="modal-backdrop"
          onClick={() => closeOnBackdropClick && onClose()}
          className={cn(
            'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0'
          )}
        />

        <DialogPrimitive.Content
          // Radix enforces modality by hiding sibling content rather than by
          // setting aria-modal. Declaring it as well costs nothing and matches
          // the ARIA authoring pattern, so both mechanisms are present.
          aria-modal="true"
          onEscapeKeyDown={(e) => !closeOnEscape && e.preventDefault()}
          onPointerDownOutside={(e) => !closeOnBackdropClick && e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'duration-200',
            sizeClasses[size],
            className
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-5 py-4">
            {/* Radix requires a Title for accessibility; hide it visually if the
                caller did not want one, rather than omitting it. */}
            <DialogPrimitive.Title
              className={cn(
                'text-lg font-semibold text-[var(--color-text-primary)]',
                !title && 'sr-only'
              )}
            >
              {title ?? 'Dialog'}
            </DialogPrimitive.Title>

            <DialogPrimitive.Close
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-secondary)]"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>

          {description && (
            <DialogPrimitive.Description className="px-5 pt-4 text-sm text-[var(--color-text-secondary)]">
              {description}
            </DialogPrimitive.Description>
          )}

          <div className={cn('max-h-[70vh] overflow-y-auto p-5', bodyClassName)}>
            {children}
          </div>

          {footer && (
            <div
              className={cn(
                'flex items-center justify-end gap-2 border-t border-[var(--color-border-primary)] px-5 py-4',
                footerClassName
              )}
            >
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
