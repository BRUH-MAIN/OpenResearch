'use client';

import React from 'react';

interface EmptyStateProps {
  /** Icon to display (should be a React element, e.g., from lucide-react) */
  icon?: React.ReactNode;
  /** Main title text */
  title: string;
  /** Description/explanation text */
  description?: string;
  /** Optional action button or other content */
  action?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-4 ${className}`}
    >
      {icon && (
        <div
          className="mb-4 opacity-80"
          style={{ color: 'var(--color-brand-secondary)' }}
        >
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
              className: `w-12 h-12 ${(icon as React.ReactElement<{ className?: string }>).props.className || ''}`,
            })
            : icon}
        </div>
      )}
      <h3
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="max-w-md mb-6"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
