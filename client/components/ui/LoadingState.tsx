'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Size of the spinner: 'sm' (16px), 'md' (24px), 'lg' (48px) */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show as full-page centered or inline */
  fullPage?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-12 h-12',
};

/**
 * LoadingState - Consistent loading spinner
 * 
 * Design system:
 * - Spinner color: #14FFEC (teal accent)
 * - Message color: #a0a0a0 (muted)
 * 
 * Usage:
 * ```tsx
 * // Full page loading
 * <LoadingState fullPage message="Loading papers..." />
 * 
 * // Inline loading
 * <LoadingState size="sm" />
 * 
 * // In a button
 * <Button disabled><LoadingState size="sm" /> Saving...</Button>
 * ```
 */
export function LoadingState({
  message,
  size = 'md',
  fullPage = false,
  className = '',
}: LoadingStateProps) {
  const spinner = (
    <Loader2
      className={`${sizeClasses[size]} text-[#14FFEC] animate-spin`}
    />
  );

  if (fullPage) {
    return (
      <div
        className={`flex flex-col items-center justify-center min-h-[50vh] ${className}`}
      >
        {spinner}
        {message && (
          <p className="mt-4 text-[#a0a0a0]">{message}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {spinner}
      {message && (
        <span className="text-[#a0a0a0] text-sm">{message}</span>
      )}
    </div>
  );
}

/**
 * LoadingSpinner - Simple standalone spinner
 * For use in buttons or tight spaces
 */
export function LoadingSpinner({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Loader2
      className={`${sizeClasses[size]} text-[#14FFEC] animate-spin ${className}`}
    />
  );
}

export default LoadingState;
