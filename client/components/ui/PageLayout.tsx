'use client';

import React from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  /** Optional page title displayed at the top */
  title?: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional right-side header actions (buttons, etc.) */
  headerActions?: React.ReactNode;
  /** Additional CSS classes for the main container */
  className?: string;
  /** Whether to use a narrower max-width (for forms, settings, etc.) */
  narrow?: boolean;
}

/**
 * PageLayout - Standardized page container component
 * 
 * Provides consistent:
 * - Max-width container (7xl default, 3xl for narrow)
 * - Responsive horizontal padding
 * - Vertical padding
 * - Optional page header with title, subtitle, and actions
 * 
 * Usage:
 * ```tsx
 * <PageLayout 
 *   title="My Page" 
 *   subtitle="Description here"
 *   headerActions={<Button>Action</Button>}
 * >
 *   {content}
 * </PageLayout>
 * ```
 */
export function PageLayout({
  children,
  title,
  subtitle,
  headerActions,
  className = '',
  narrow = false,
}: PageLayoutProps) {
  const maxWidth = narrow ? 'max-w-3xl' : 'max-w-7xl';

  return (
    <div
      className={`${maxWidth} mx-auto px-4 sm:px-6 lg:px-8 py-8 ${className}`}
    >
      {(title || headerActions) && (
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              {title && (
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-2 text-[#a0a0a0]">{subtitle}</p>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center gap-3 flex-shrink-0">
                {headerActions}
              </div>
            )}
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

export default PageLayout;
