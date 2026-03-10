'use client';

import React, { memo, useMemo, useState } from 'react';
import { Bot, Copy, ThumbsUp, ThumbsDown, User, Search, Database, Globe, Download, Layers, CheckCircle2, Loader2, BrainCircuit, FileSearch, Pin } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface Citation {
  id: string;
  sourceId: string;
  sourceTitle: string;
  excerpt?: string;
}

export interface ResearchMessageProps {
  id: string;
  content: string;
  type: 'user' | 'ai' | 'system';
  userName?: string;
  userAvatar?: string;
  timestamp: Date;
  citations?: Citation[];
  highlightedTerms?: string[];
  isCurrentUser?: boolean;
  isStreaming?: boolean;
  ref?: React.Ref<HTMLDivElement>;
  onFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
  onCopy?: (content: string) => void;
  onSaveToNotes?: (messageId: string) => void;
  onPin?: (messageId: string, content: string) => void;
  onCitationClick?: (citation: Citation) => void;
  onDiagramDetected?: (code: string) => void;
  metadata?: Record<string, unknown>;
  onWorkflowApprove?: (messageId: string, workflowId: string, stepIndex: number, feedback?: string) => Promise<void> | void;
  onWorkflowReject?: (messageId: string, workflowId: string, stepIndex: number, feedback?: string) => Promise<void> | void;
  onWorkflowStart?: (messageId: string, workflowId: string) => Promise<void> | void;
  onWorkflowCancel?: (messageId: string, workflowId: string) => Promise<void> | void;
  className?: string;
}

interface AgenticStep {
  icon?: string;
  status: 'pending' | 'active' | 'done' | string;
  label: string;
  detail?: string;
  sub_steps?: string[];
}

function isAgenticStepArray(value: unknown): value is AgenticStep[] {
  if (!Array.isArray(value)) return false;
  return value.every((step) => (
    typeof step === 'object'
    && step !== null
    && 'label' in step
    && typeof (step as { label: unknown }).label === 'string'
  ));
}

export const ResearchMessage = memo(function ResearchMessage({
  id,
  content,
  type,
  userName,
  timestamp,
  citations,
  highlightedTerms = [],
  isStreaming = false,
  ref,
  onFeedback,
  onCopy,
  onPin,
  onCitationClick,
  onDiagramDetected,
  metadata,
  onWorkflowApprove,
  onWorkflowReject,
  onWorkflowStart,
  onWorkflowCancel,
  className = '',
}: ResearchMessageProps) {
    const isAI = type === 'ai';
    const isSystem = type === 'system';
    const [checkpointFeedback, setCheckpointFeedback] = useState('');
    const [workflowActionState, setWorkflowActionState] = useState<'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected'>('idle');
    const [planActionState, setPlanActionState] = useState<'idle' | 'starting' | 'cancelling' | 'started' | 'cancelled'>('idle');

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const getMarkdownContent = () => {
      if (highlightedTerms.length === 0) return content;

      let result = content;
      highlightedTerms.forEach((term) => {
        // Only bold-wrap terms outside of markdown link syntax to avoid breaking links
        const regex = new RegExp(`(?<![\\[\\(])\\b(${escapeRegExp(term)})\\b(?![\\]\\)])`, 'gi');
        result = result.replace(regex, '**$1**');
      });

      return result;
    };

    let agenticSteps: AgenticStep[] | null = null;
    if (isAI && content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content) as { agentic_steps?: unknown };
        if (isAgenticStepArray(parsed.agentic_steps)) {
          agenticSteps = parsed.agentic_steps;
        }
      } catch {
        // ignore if not valid JSON
      }
    }

    const workflowCheckpoint = useMemo(() => {
      if (!metadata) return null;
      if (metadata.task_type !== 'workflow' || metadata.paused !== true) return null;

      const workflowId = typeof metadata.workflow_id === 'string' ? metadata.workflow_id : null;
      const stepIndexValue = metadata.step_index;
      const stepIndex = typeof stepIndexValue === 'number'
        ? stepIndexValue
        : typeof stepIndexValue === 'string'
          ? Number(stepIndexValue)
          : NaN;
      if (!workflowId || Number.isNaN(stepIndex) || stepIndex < 0) return null;

      const stepName = typeof metadata.checkpoint_step_name === 'string'
        ? metadata.checkpoint_step_name
        : `Step ${stepIndex + 1}`;

      return { workflowId, stepIndex, stepName };
    }, [metadata]);

    const workflowPlan = useMemo(() => {
      if (!metadata) return null;
      if (metadata.task_type !== 'workflow_plan' || metadata.planned !== true) return null;
      const workflowId = typeof metadata.workflow_id === 'string' ? metadata.workflow_id : null;
      if (!workflowId) return null;
      return { workflowId };
    }, [metadata]);

    const handleWorkflowAction = async (approved: boolean) => {
      if (!workflowCheckpoint) return;
      if (approved && !onWorkflowApprove) return;
      if (!approved && !onWorkflowReject) return;

      try {
        setWorkflowActionState(approved ? 'approving' : 'rejecting');
        if (approved) {
          await onWorkflowApprove?.(id, workflowCheckpoint.workflowId, workflowCheckpoint.stepIndex, checkpointFeedback.trim() || undefined);
          setWorkflowActionState('approved');
        } else {
          await onWorkflowReject?.(id, workflowCheckpoint.workflowId, workflowCheckpoint.stepIndex, checkpointFeedback.trim() || undefined);
          setWorkflowActionState('rejected');
        }
      } catch {
        setWorkflowActionState('idle');
      }
    };

    const handlePlanAction = async (start: boolean) => {
      if (!workflowPlan) return;
      try {
        setPlanActionState(start ? 'starting' : 'cancelling');
        if (start) {
          await onWorkflowStart?.(id, workflowPlan.workflowId);
          setPlanActionState('started');
          return;
        }
        await onWorkflowCancel?.(id, workflowPlan.workflowId);
        setPlanActionState('cancelled');
      } catch {
        setPlanActionState('idle');
      }
    };

    const getIconForStep = (iconName: string, status: string) => {
      if (status === 'active') {
        return <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-brand-secondary)' }} />;
      }
      if (status === 'done') {
        return <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} />;
      }

      const props = { size: 18, style: { color: 'var(--color-text-muted)' } };
      switch (iconName) {
        case 'search': return <Search {...props} />;
        case 'database': return <Database {...props} />;
        case 'globe': return <Globe {...props} />;
        case 'download': return <Download {...props} />;
        case 'layers': return <Layers {...props} />;
        case 'brain': return <BrainCircuit {...props} />;
        case 'file-search': return <FileSearch {...props} />;
        default: return <Bot {...props} />;
      }
    };

    const renderAgenticSteps = (steps: AgenticStep[]) => {
      const doneCount = steps.filter((s) => s.status === 'done').length;
      const hasActive = steps.some((s) => s.status === 'active');
      const progressPct = Math.round(((doneCount + (hasActive ? 0.5 : 0)) / steps.length) * 100);

      return (
        <div className="my-2 w-full max-w-md">
          {/* Overall progress header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {progressPct < 100 ? 'Processing…' : 'Complete'}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {doneCount}/{steps.length} steps
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-1 rounded-full mb-4 overflow-hidden"
            style={{ background: 'var(--color-bg-tertiary)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: 'var(--color-brand-secondary)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: hasActive ? '0 0 8px rgba(20, 255, 236, 0.4)' : 'none',
              }}
            />
          </div>

          {/* Step list with timeline */}
          <div className="relative">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[17px] top-3 bottom-3 w-px"
              style={{ background: 'var(--color-border-primary)' }}
            />

            <div className="space-y-1">
              {steps.map((step, idx) => {
                const isActive = step.status === 'active';
                const isDone = step.status === 'done';
                const isPending = step.status === 'pending';
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-3 py-2 px-2 rounded-lg relative"
                    style={{
                      background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                      transition: 'background 0.3s ease, opacity 0.3s ease',
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    {/* Icon node on timeline */}
                    <div
                      className="shrink-0 relative z-10 w-[34px] h-[34px] rounded-full flex items-center justify-center"
                      style={{
                        background: isActive
                          ? 'var(--color-bg-tertiary)'
                          : isDone
                            ? 'var(--color-bg-tertiary)'
                            : 'var(--color-bg-secondary)',
                        border: isActive
                          ? '2px solid var(--color-brand-secondary)'
                          : isDone
                            ? '2px solid var(--color-success)'
                            : '1px solid var(--color-border-primary)',
                        boxShadow: isActive ? '0 0 12px rgba(20, 255, 236, 0.2)' : 'none',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {getIconForStep(step.icon || '', step.status)}
                    </div>

                    {/* Label + detail */}
                    <div className="flex-1 min-w-0 pt-1">
                      <p
                        className={`text-[13px] leading-tight ${isActive ? 'font-semibold' : isDone ? 'font-medium' : ''}`}
                        style={{
                          color: isActive
                            ? 'var(--color-brand-secondary)'
                            : isDone
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-muted)',
                          transition: 'color 0.3s ease',
                        }}
                      >
                        {step.label}
                      </p>
                      {step.detail && (isActive || isDone) && (
                        <p
                          className="text-[11px] mt-0.5 truncate"
                          style={{
                            color: isActive ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                            transition: 'color 0.3s ease',
                          }}
                        >
                          {step.detail}
                        </p>
                      )}
                      {/* Sub-steps (e.g. generated queries) */}
                      {isDone && step.sub_steps && Array.isArray(step.sub_steps) && step.sub_steps.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {step.sub_steps.map((sub: string, si: number) => (
                            <p
                              key={si}
                              className="text-[10px] pl-2 truncate"
                              style={{
                                color: 'var(--color-text-muted)',
                                borderLeft: '1px solid var(--color-border-primary)',
                              }}
                            >
                              {sub}
                            </p>
                          ))}
                        </div>
                      )}
                      {/* Indeterminate bar for active step */}
                      {isActive && (
                        <div
                          className="mt-2 h-0.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--color-bg-tertiary)', width: '100%' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: '40%',
                              background: 'var(--color-brand-secondary)',
                              animation: 'indeterminate-bar 1.4s ease-in-out infinite',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CSS keyframes for indeterminate bar */}
          <style>{`
            @keyframes indeterminate-bar {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(150%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
      );
    };

    // System messages
    if (isSystem) {
      return (
        <div ref={ref} className={`flex justify-center py-2 ${className}`}>
          <div
            className="px-4 py-2 rounded-full research-system-pill"
            style={{
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border-primary)',
            }}
          >
            <p className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {content}
            </p>
          </div>
        </div>
      );
    }

    // AI Response
    if (isAI) {
      return (
        <div ref={ref} className={`group animate-fade-in-up ${className}`}>
          <div className="research-ai-message">
            <div
              className="research-ai-avatar"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <Bot size={22} style={{ color: 'var(--color-brand-primary)' }} />
            </div>

            <div className="flex-1 min-w-0 max-w-full">
              <div className="research-ai-card">
                <div className="research-ai-card-header">
                  <div className="min-w-0">
                    <p className="research-ai-card-eyebrow">Research Assistant</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="research-ai-card-title">Synthesized response</span>
                      {isStreaming && <span className="research-inline-status">Streaming</span>}
                    </div>
                  </div>
                  <span className="research-message-time">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div style={{ color: 'var(--color-text-primary)' }}>
                  {agenticSteps ? (
                    renderAgenticSteps(agenticSteps)
                  ) : (
                    <MarkdownRenderer content={getMarkdownContent()} isStreaming={isStreaming} onDiagramDetected={onDiagramDetected} />
                  )}
                </div>

                {workflowCheckpoint && (
                  <div
                    className="mt-4 rounded-xl border p-3"
                    style={{
                      borderColor: 'var(--color-border-primary)',
                      background: 'var(--color-bg-tertiary)',
                    }}
                  >
                    <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Checkpoint: {workflowCheckpoint.stepName}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Continue or reject directly from chat.
                    </p>

                    {workflowActionState === 'approved' || workflowActionState === 'rejected' ? (
                      <p className="text-[12px] mt-3" style={{ color: 'var(--color-success)' }}>
                        {workflowActionState === 'approved' ? 'Approved. Workflow is resuming.' : 'Rejected. Workflow remains paused.'}
                      </p>
                    ) : (
                      <>
                        <textarea
                          value={checkpointFeedback}
                          onChange={(e) => setCheckpointFeedback(e.target.value)}
                          placeholder="Optional feedback for this checkpoint"
                          className="mt-3 w-full h-20 rounded-lg border px-3 py-2 text-[12px] focus:outline-none"
                          style={{
                            background: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border-primary)',
                            color: 'var(--color-text-primary)',
                          }}
                        />

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => handleWorkflowAction(true)}
                            disabled={workflowActionState === 'approving' || workflowActionState === 'rejecting' || !onWorkflowApprove}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
                            style={{
                              background: 'var(--color-success-bg)',
                              color: 'var(--color-success)',
                              border: '1px solid rgba(34,197,94,0.35)',
                            }}
                          >
                            {workflowActionState === 'approving' ? 'Continuing...' : 'Continue'}
                          </button>
                          <button
                            onClick={() => handleWorkflowAction(false)}
                            disabled={workflowActionState === 'approving' || workflowActionState === 'rejecting' || !onWorkflowReject}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
                            style={{
                              background: 'transparent',
                              color: 'var(--color-error)',
                              border: '1px solid rgba(239,68,68,0.35)',
                            }}
                          >
                            {workflowActionState === 'rejecting' ? 'Rejecting...' : 'Reject'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {workflowPlan && (
                  <div
                    className="mt-4 rounded-xl border p-3"
                    style={{
                      borderColor: 'var(--color-border-primary)',
                      background: 'var(--color-bg-tertiary)',
                    }}
                  >
                    <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Workflow plan ready
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Start or cancel this workflow from chat.
                    </p>

                    {planActionState === 'started' || planActionState === 'cancelled' ? (
                      <p className="text-[12px] mt-3" style={{ color: 'var(--color-success)' }}>
                        {planActionState === 'started' ? 'Workflow started.' : 'Workflow cancelled.'}
                      </p>
                    ) : (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => handlePlanAction(true)}
                          disabled={planActionState === 'starting' || planActionState === 'cancelling' || !onWorkflowStart}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
                          style={{
                            background: 'var(--color-success-bg)',
                            color: 'var(--color-success)',
                            border: '1px solid rgba(34,197,94,0.35)',
                          }}
                        >
                          {planActionState === 'starting' ? 'Starting...' : 'Start Workflow'}
                        </button>
                        <button
                          onClick={() => handlePlanAction(false)}
                          disabled={planActionState === 'starting' || planActionState === 'cancelling' || !onWorkflowCancel}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-60"
                          style={{
                            background: 'transparent',
                            color: 'var(--color-error)',
                            border: '1px solid rgba(239,68,68,0.35)',
                          }}
                        >
                          {planActionState === 'cancelling' ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Citations */}
                {citations && citations.length > 0 && (
                  <div className="mt-5 pt-4 research-ai-card-divider">
                    <p className="text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--color-text-muted)' }}>
                      Sources Referenced
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {citations.map((citation, index) => (
                        <button
                          key={citation.id}
                          onClick={() => onCitationClick?.(citation)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all"
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border-primary)',
                            color: 'var(--color-brand-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-accent)';
                            e.currentTarget.style.boxShadow = '0 0 8px rgba(13, 115, 119, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <span className="font-medium">[{index + 1}]</span>
                          <span
                            className="truncate max-w-[150px]"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {citation.sourceTitle}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-5 pt-4 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity research-ai-card-divider">
                  {onCopy && (
                    <button
                      onClick={() => onCopy(content)}
                      className="p-2 rounded-full transition-colors"
                      title="Copy"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                        e.currentTarget.style.color = 'var(--color-text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      }}
                    >
                      <Copy size={16} />
                    </button>
                  )}
                  {onPin && (
                    <button
                      onClick={() => onPin(id, content)}
                      className="p-2 rounded-full transition-colors"
                      title="Pin to Workspace"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                        e.currentTarget.style.color = 'var(--color-brand-secondary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      }}
                    >
                      <Pin size={16} />
                    </button>
                  )}
                  {onFeedback && (
                    <>
                  <button
                    onClick={() => onFeedback(id, 'up')}
                    className="p-2 rounded-full transition-colors"
                    title="Helpful"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-success-bg)';
                      e.currentTarget.style.color = 'var(--color-success)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    }}
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    onClick={() => onFeedback(id, 'down')}
                    className="p-2 rounded-full transition-colors"
                    title="Not helpful"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-error-bg)';
                      e.currentTarget.style.color = 'var(--color-error)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    }}
                  >
                    <ThumbsDown size={16} />
                  </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // User Message
    return (
      <div ref={ref} className={`animate-fade-in ${className}`}>
        <div className="flex justify-end">
          <div className="research-user-message">
            <div className="flex items-center justify-end gap-2 mb-2">
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {userName || 'You'}
              </span>
              <span
                className="text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-bg-elevated)' }}
              >
                <User size={16} style={{ color: 'var(--color-text-primary)' }} />
              </div>
            </div>

            <div className="research-user-bubble" style={{ color: 'var(--color-text-primary)' }}>
              <MarkdownRenderer content={getMarkdownContent()} onDiagramDetected={onDiagramDetected} />
            </div>
          </div>
        </div>
      </div>
    );
});

export default ResearchMessage;
