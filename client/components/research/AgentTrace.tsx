'use client';

import React, { useState } from 'react';
import {
  Search,
  Globe,
  FileText,
  Sparkles,
  Check,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import type { AgentStep } from '@/lib/socket';

/**
 * The agent's reasoning, shown as it happens.
 *
 * An agent that thinks for 40 seconds behind a spinner is indistinguishable
 * from a hung request. Showing each tool call as it runs is what makes the wait
 * legible — and it lets the reader judge whether the agent actually looked in
 * the right places, which is the difference between trusting the answer and
 * taking it on faith.
 */

const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  search_group_papers: {
    label: 'Searching the group’s papers',
    icon: <Search size={13} />,
  },
  search_arxiv: {
    label: 'Searching arXiv',
    icon: <Globe size={13} />,
  },
  read_paper: {
    label: 'Reading a paper in full',
    icon: <FileText size={13} />,
  },
  synthesize: {
    label: 'Writing the answer',
    icon: <Sparkles size={13} />,
  },
};

function describe(step: AgentStep): string {
  const query = step.args?.query ?? step.args?.title;
  return typeof query === 'string' && query ? `“${query}”` : '';
}

interface AgentTraceProps {
  steps: AgentStep[];
  isRunning: boolean;
}

export function AgentTrace({ steps, isRunning }: AgentTraceProps) {
  // Collapsed once finished: while it runs the trace is the content, afterwards
  // it is evidence, and the answer should have the floor.
  const [expanded, setExpanded] = useState(true);
  const showSteps = isRunning || expanded;

  if (steps.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-primary)',
      }}
    >
      <button
        onClick={() => setExpanded((prev) => !prev)}
        disabled={isRunning}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {isRunning ? (
          <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-brand-secondary)' }} />
        ) : (
          <Check size={13} style={{ color: 'var(--color-success)' }} />
        )}
        <span className="text-[12px] font-medium">
          {isRunning
            ? `Investigating — step ${steps.length}`
            : `Investigated in ${steps.length} step${steps.length !== 1 ? 's' : ''}`}
        </span>
        {!isRunning && (
          <ChevronDown
            size={13}
            className="ml-auto transition-transform"
            style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
          />
        )}
      </button>

      {showSteps && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {steps.map((step, index) => {
            const tool = TOOL_LABELS[step.tool] ?? {
              label: step.tool,
              icon: <Search size={13} />,
            };
            const isActive = isRunning && index === steps.length - 1 && !step.done;

            return (
              <div key={`${step.n}-${index}`} className="flex items-start gap-2">
                <div
                  className="mt-0.5 shrink-0"
                  style={{
                    color: isActive
                      ? 'var(--color-brand-secondary)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {isActive ? <Loader2 size={13} className="animate-spin" /> : tool.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="text-[12px] leading-snug"
                    style={{
                      color: isActive
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)',
                    }}
                  >
                    {tool.label}{' '}
                    <span style={{ color: 'var(--color-text-muted)' }}>{describe(step)}</span>
                  </p>

                  {step.summary && (
                    <p
                      className="text-[11px] mt-0.5 truncate"
                      style={{ color: 'var(--color-text-muted)' }}
                      title={step.summary}
                    >
                      {step.summary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AgentTrace;
