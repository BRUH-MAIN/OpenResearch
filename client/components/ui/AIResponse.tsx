'use client';

import React from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { LoadingSpinner } from './LoadingState';

interface AIResponseProps {
  /** The AI-generated content */
  children: React.ReactNode;
  /** Current state of the AI response */
  state?: 'loading' | 'success' | 'error';
  /** Loading message */
  loadingMessage?: string;
  /** Error message (when state is 'error') */
  errorMessage?: string;
  /** Whether to show the AI badge/icon */
  showBadge?: boolean;
  /** Title for the response section */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

export function AIResponse({
  children,
  state = 'success',
  loadingMessage = 'AI is thinking...',
  errorMessage = 'Failed to generate response',
  showBadge = true,
  title,
  className = '',
}: AIResponseProps) {
  // Loading state
  if (state === 'loading') {
    return (
      <div
        className={`border-l-4 rounded-r-lg p-4 animate-pulse ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-brand-secondary)',
        }}
      >
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <span style={{ color: 'var(--color-text-secondary)' }}>{loadingMessage}</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div
        className={`border-l-4 rounded-r-lg p-4 ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-error)',
        }}
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
          <span style={{ color: 'var(--color-error)' }}>{errorMessage}</span>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div
      className={`border-l-4 rounded-r-lg p-4 ${className}`}
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-brand-secondary)',
      }}
    >
      {/* Header with AI badge */}
      {(showBadge || title) && (
        <div className="flex items-center gap-2 mb-3">
          {showBadge && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ background: 'rgba(20, 255, 236, 0.1)' }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-brand-secondary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-brand-secondary)' }}>AI</span>
            </div>
          )}
          {title && (
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
          )}
        </div>
      )}

      {/* Content */}
      <div
        className="text-sm leading-relaxed prose prose-sm max-w-none"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {children}
      </div>
    </div>
  );
}

export function AIBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${className}`}
      style={{
        background: 'rgba(20, 255, 236, 0.1)',
        color: 'var(--color-brand-secondary)',
      }}
    >
      <Sparkles className="w-3 h-3" />
      <span className="text-xs font-medium">AI</span>
    </span>
  );
}

export function AITypingIndicator({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span
        className="w-2 h-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-brand-secondary)', animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-brand-secondary)', animationDelay: '150ms' }}
      />
      <span
        className="w-2 h-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-brand-secondary)', animationDelay: '300ms' }}
      />
    </div>
  );
}

export default AIResponse;
