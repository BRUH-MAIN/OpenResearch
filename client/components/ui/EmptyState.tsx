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

/**
 * EmptyState - Consistent empty state display
 * 
 * Used when:
 * - No data is available
 * - Search returns no results
 * - User hasn't created content yet
 * 
 * Design system colors:
 * - Icon: text-[#14FFEC] (teal accent)
 * - Title: text-white
 * - Description: text-[#a0a0a0] (muted)
 * 
 * Usage:
 * ```tsx
 * <EmptyState
 *   icon={<FileText className="w-12 h-12" />}
 *   title="No papers found"
 *   description="Try adjusting your search or add some papers"
 *   action={<Button>Add Paper</Button>}
 * />
 * ```
 */
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
        <div className="text-[#14FFEC] mb-4 opacity-80">
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
                className: `w-12 h-12 ${(icon as React.ReactElement<{ className?: string }>).props.className || ''}`,
              })
            : icon}
        </div>
      )}
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-[#a0a0a0] max-w-md mb-6">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
