'use client';

import React from 'react';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
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

/**
 * AIResponse - Consistent AI-generated content display
 * 
 * Design system:
 * - Container: #1a1a1a with teal left border
 * - AI badge: #14FFEC sparkle icon
 * - Loading: Teal spinner with pulsing animation
 * - Error: Red accent
 * 
 * Usage:
 * ```tsx
 * <AIResponse state="loading" loadingMessage="Analyzing paper..." />
 * 
 * <AIResponse state="success" title="AI Summary">
 *   <p>This paper discusses...</p>
 * </AIResponse>
 * 
 * <AIResponse state="error" errorMessage="Failed to generate response" />
 * ```
 */
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
        className={`
          bg-[#1a1a1a] border-l-4 border-[#14FFEC] rounded-r-lg p-4
          animate-pulse
          ${className}
        `}
      >
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <span className="text-[#a0a0a0]">{loadingMessage}</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div
        className={`
          bg-[#1a1a1a] border-l-4 border-red-500 rounded-r-lg p-4
          ${className}
        `}
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400">{errorMessage}</span>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div
      className={`
        bg-[#1a1a1a] border-l-4 border-[#14FFEC] rounded-r-lg p-4
        ${className}
      `}
    >
      {/* Header with AI badge */}
      {(showBadge || title) && (
        <div className="flex items-center gap-2 mb-3">
          {showBadge && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#14FFEC]/10 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-[#14FFEC]" />
              <span className="text-xs font-medium text-[#14FFEC]">AI</span>
            </div>
          )}
          {title && (
            <span className="text-sm font-medium text-white">{title}</span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="text-[#e0e0e0] text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
        {children}
      </div>
    </div>
  );
}

/**
 * AIBadge - Small inline AI indicator
 * For use in cards, list items, etc.
 */
export function AIBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 
        bg-[#14FFEC]/10 rounded text-[#14FFEC]
        ${className}
      `}
    >
      <Sparkles className="w-3 h-3" />
      <span className="text-xs font-medium">AI</span>
    </span>
  );
}

/**
 * AITypingIndicator - Animated typing dots
 * Shows AI is actively generating content
 */
export function AITypingIndicator({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-[#14FFEC] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default AIResponse;
