'use client';

import React, { useCallback, useState } from 'react';
import type { IntentClassifiedEvent, AgenticTaskType } from '@/lib/api';

const TASK_LABELS: Record<string, string> = {
  paper_retrieval: 'Paper Retrieval',
  literature_survey: 'Literature Survey',
  gap_analysis: 'Gap Analysis',
  fact_check: 'Fact Check',
  novelty_assessment: 'Novelty Assessment',
  research_mentor: 'Research Mentor',
  paper_writing: 'Paper Writing',
  research_planning: 'Research Planning',
  deep_research: 'Deep Research',
  methodology_extraction: 'Methodology Extraction',
  reviewer_anticipation: 'Reviewer Anticipation',
};

export interface IntentBannerProps {
  event: IntentClassifiedEvent | null;
  onOverride?: (newIntent: AgenticTaskType) => void;
  className?: string;
}

/**
 * Transient banner showing the classified intent with confidence.
 * When ambiguous, shows alternatives the user can click to override.
 */
export function IntentBanner({ event, onOverride, className = '' }: IntentBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleOverride = useCallback(
    (intent: string) => {
      onOverride?.(intent as AgenticTaskType);
      setDismissed(true);
    },
    [onOverride],
  );

  // Reset dismissed when a new event arrives
  React.useEffect(() => {
    setDismissed(false);
  }, [event]);

  if (!event || dismissed) return null;

  const label = event.task_type ? TASK_LABELS[event.task_type] || event.task_type : 'Unknown';
  const confidence = Math.round(event.similarity * 100);
  const isAmbiguous = event.ambiguous;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all
        ${isAmbiguous ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/30' : 'border-blue-500/30 bg-blue-50 dark:bg-blue-950/30'}
        ${className}`}
    >
      <span className="shrink-0">
        {isAmbiguous ? '⚠️' : '🎯'}
      </span>
      <span className="font-medium">
        Detected: <strong>{label}</strong>
        <span className="ml-1 text-xs text-muted-foreground">({confidence}%)</span>
      </span>

      {isAmbiguous && event.alternatives.length > 0 && (
        <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
          Did you mean:
          {event.alternatives.slice(0, 3).map((alt) => (
            <button
              key={alt.intent}
              onClick={() => handleOverride(alt.intent)}
              className="rounded bg-amber-200/60 px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-300/80 dark:bg-amber-800/40 dark:text-amber-200 dark:hover:bg-amber-700/60"
            >
              {TASK_LABELS[alt.intent] || alt.intent}
            </button>
          ))}
        </span>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="ml-auto text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
