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

export function LoadingState({
  message,
  size = 'md',
  fullPage = false,
  className = '',
}: LoadingStateProps) {
  const spinner = (
    <Loader2
      className={`${sizeClasses[size]} animate-spin`}
      style={{ color: 'var(--color-brand-secondary)' }}
    />
  );

  if (fullPage) {
    return (
      <div
        className={`flex flex-col items-center justify-center min-h-[50vh] ${className}`}
      >
        {spinner}
        {message && (
          <p className="mt-4" style={{ color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {spinner}
      {message && (
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {message}
        </span>
      )}
    </div>
  );
}

export function LoadingSpinner({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Loader2
      className={`${sizeClasses[size]} animate-spin ${className}`}
      style={{ color: 'var(--color-brand-secondary)' }}
    />
  );
}

export default LoadingState;
