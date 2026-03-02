'use client';

import React from 'react';
import type { CitationAnchoredSentence } from '@/lib/api';

export interface CitationAnchoredTextProps {
  sentences: CitationAnchoredSentence[];
  /** Optional callback when a citation tag is clicked */
  onCitationClick?: (sourceId: string) => void;
  className?: string;
}

/**
 * Renders a block of text where each sentence has inline citation badges
 * anchored by embedding similarity.
 */
export function CitationAnchoredText({
  sentences,
  onCitationClick,
  className = '',
}: CitationAnchoredTextProps) {
  if (!sentences?.length) return null;

  return (
    <div className={`leading-relaxed ${className}`}>
      {sentences.map((s, idx) => (
        <span key={idx}>
          {s.text}
          {s.source_ids.length > 0 && (
            <>
              {' '}
              {s.source_ids.map((sid) => (
                <button
                  key={sid}
                  onClick={() => onCitationClick?.(sid)}
                  className="ml-0.5 inline-flex items-center rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                  title={`Source: ${sid}`}
                >
                  {sid}
                </button>
              ))}
            </>
          )}
          {' '}
        </span>
      ))}
    </div>
  );
}
