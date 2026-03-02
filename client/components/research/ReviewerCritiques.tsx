'use client';

import React from 'react';
import type { ReviewerCritique } from '@/lib/api';

export interface ReviewerCritiquesProps {
  critiques: ReviewerCritique[];
  className?: string;
}

const SEVERITY_STYLES: Record<string, { border: string; badge: string; icon: string }> = {
  high: {
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    icon: '🔴',
  },
  medium: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    icon: '🟡',
  },
  low: {
    border: 'border-l-green-500',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    icon: '🟢',
  },
};

/**
 * Renders anticipated reviewer critiques in collapsible cards.
 */
export function ReviewerCritiques({ critiques, className = '' }: ReviewerCritiquesProps) {
  if (!critiques?.length) {
    return (
      <div className={`rounded-lg border border-dashed border-muted p-4 text-center text-sm text-muted-foreground ${className}`}>
        No reviewer critiques generated.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {critiques.map((c, idx) => {
        const severity = c.severity?.toLowerCase() || 'medium';
        const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.medium;

        return (
          <details key={idx} className={`group rounded-lg border border-l-4 ${styles.border}`} open={idx < 3}>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-medium hover:bg-muted/30">
              <span>{styles.icon}</span>
              <span className="flex-1">{c.critique}</span>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${styles.badge}`}>
                {severity.toUpperCase()}
              </span>
              <svg
                className="h-4 w-4 shrink-0 rotate-0 text-muted-foreground transition-transform group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </summary>
            <div className="space-y-2 border-t px-4 py-3 text-sm">
              <div>
                <span className="font-semibold text-muted-foreground">Reasoning:</span>{' '}
                <span>{c.reasoning}</span>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">Suggested response:</span>{' '}
                <span className="text-green-700 dark:text-green-400">{c.suggested_response}</span>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
