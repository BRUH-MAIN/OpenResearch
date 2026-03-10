'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  FileText,
  AlertCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { api, WorkflowTemplate, WorkflowPlanResponse, WorkflowStepInfo, WorkflowEvent } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';

// ─── Types ───────────────────────────────────────────────────────────

type Phase = 'templates' | 'goal' | 'planning' | 'review' | 'running' | 'completed' | 'error';

interface StepProgress {
  index: number;
  name: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'approved' | 'rejected';
  isCheckpoint: boolean;
  output?: string;
  error?: string;
}

interface WorkflowPanelProps {
  groupId?: string;
  sessionId?: string;
  className?: string;
}

// ─── Status icon helper ──────────────────────────────────────────────

function StepStatusIcon({ status }: { status: StepProgress['status'] }) {
  switch (status) {
    case 'completed':
    case 'approved':
      return <CheckCircle size={14} className="text-green-500" />;
    case 'running':
      return <Loader2 size={14} className="animate-spin text-blue-400" />;
    case 'failed':
    case 'rejected':
      return <XCircle size={14} className="text-red-400" />;
    case 'awaiting_approval':
      return <Pause size={14} className="text-amber-400" />;
    default:
      return <Clock size={14} style={{ color: 'var(--color-text-muted)' }} />;
  }
}

// ─── Component ───────────────────────────────────────────────────────

export function WorkflowPanel({ groupId, sessionId, className = '' }: WorkflowPanelProps) {
  const { accessToken } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('templates');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [goal, setGoal] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>();
  const [plan, setPlan] = useState<WorkflowPlanResponse | null>(null);
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkpointFeedback, setCheckpointFeedback] = useState('');

  // ── Load templates ────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    api.listWorkflowTemplates(accessToken).then(setTemplates).catch(console.error);
  }, [accessToken]);

  // ── Handle workflow events from Socket.IO ─────────────────────────
  const handleWorkflowEvent = useCallback((event: WorkflowEvent) => {
    const type = event.type;

    if (type === 'workflow:step:started') {
      const idx = event.step_index ?? -1;
      setCurrentStep(idx);
      setSteps((prev) =>
        prev.map((s) => (s.index === idx ? { ...s, status: 'running' } : s))
      );
    } else if (type === 'workflow:step:completed') {
      const idx = event.step_index ?? -1;
      const content = event.output_preview || event.content || '';
      setSteps((prev) =>
        prev.map((s) =>
          s.index === idx ? { ...s, status: 'completed', output: content.slice(0, 2000) } : s
        )
      );
    } else if (type === 'workflow:step:checkpoint') {
      const idx = event.step_index ?? -1;
      const checkpointOutput = event.output || '';
      setSteps((prev) =>
        prev.map((s) =>
          s.index === idx ? { ...s, status: 'awaiting_approval', output: checkpointOutput.slice(0, 5000) } : s
        )
      );
      setPhase('running'); // stay in running but show approval UI
    } else if (type === 'workflow:step:failed' || type === 'workflow:failed') {
      const idx = event.step_index;
      const errMsg = event.error || event.message || 'Step failed';
      if (idx !== undefined) {
        setSteps((prev) =>
          prev.map((s) =>
            s.index === idx ? { ...s, status: 'failed', error: errMsg } : s
          )
        );
      }
      if (type === 'workflow:failed') {
        setError(errMsg);
        setPhase('error');
      }
    } else if (type === 'workflow:completed') {
      // Collect final outputs from all completed steps
      setSteps((prev) => [...prev]); // keep existing step outputs
      setPhase('completed');
    }
  }, []);

  // ── Listen for Socket.IO workflow events ──────────────────────────
  useEffect(() => {
    // We'll listen via window custom events dispatched from the socket hook
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WorkflowEvent>).detail;
      if (detail.workflowId === workflowId || detail.workflow_id === workflowId) {
        handleWorkflowEvent(detail);
      }
    };
    window.addEventListener('workflow:event', handler);
    return () => window.removeEventListener('workflow:event', handler);
  }, [workflowId, handleWorkflowEvent]);

  // ── Plan workflow ─────────────────────────────────────────────────
  const handlePlan = useCallback(async () => {
    if (!accessToken || !goal.trim()) return;
    setIsLoading(true);
    setError(null);
    setPhase('planning');

    try {
      const result = await api.planWorkflow(accessToken, {
        goal: goal.trim(),
        groupId,
        sessionId,
        preferredTemplate: selectedTemplate,
      });
      setPlan(result);
      setWorkflowId(result.workflow_id);
      setSteps(
        result.steps.map((s: WorkflowStepInfo) => ({
          index: s.step_index,
          name: s.name,
          agentType: s.agent_type,
          status: 'pending' as const,
          isCheckpoint: s.is_checkpoint,
        }))
      );
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planning failed');
      setPhase('error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, goal, groupId, sessionId, selectedTemplate]);

  // ── Start workflow ────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!accessToken || !workflowId) return;
    setPhase('running');
    setIsLoading(true);

    try {
      await api.startWorkflow(accessToken, {
        workflowId,
        sessionId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow');
      setPhase('error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, workflowId, sessionId]);

  // ── Approve checkpoint ────────────────────────────────────────────
  const handleApprove = useCallback(async (stepIndex: number) => {
    if (!accessToken || !workflowId) return;
    setIsLoading(true);

    try {
      await api.approveWorkflowStep(accessToken, {
        workflowId,
        stepIndex,
        approved: true,
        feedback: checkpointFeedback || undefined,
        sessionId,
      });
      setCheckpointFeedback('');
      setSteps((prev) =>
        prev.map((s) =>
          s.index === stepIndex ? { ...s, status: 'approved' } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, workflowId, checkpointFeedback, sessionId]);

  // ── Reject checkpoint ─────────────────────────────────────────────
  const handleReject = useCallback(async (stepIndex: number) => {
    if (!accessToken || !workflowId) return;
    setIsLoading(true);

    try {
      await api.approveWorkflowStep(accessToken, {
        workflowId,
        stepIndex,
        approved: false,
        feedback: checkpointFeedback || undefined,
        sessionId,
      });
      setCheckpointFeedback('');
      setSteps((prev) =>
        prev.map((s) =>
          s.index === stepIndex ? { ...s, status: 'rejected' } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, workflowId, checkpointFeedback, sessionId]);

  // ── Cancel workflow ───────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!accessToken || !workflowId) return;
    try {
      await api.cancelWorkflow(accessToken, workflowId);
      setPhase('templates');
      setWorkflowId(null);
      setPlan(null);
      setSteps([]);
      setGoal('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    }
  }, [accessToken, workflowId]);

  // ── Reset ─────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPhase('templates');
    setPlan(null);
    setSteps([]);
    setWorkflowId(null);
    setGoal('');
    setError(null);
    setSelectedTemplate(undefined);
    setCurrentStep(-1);
  }, []);

  // ── Checkpoint step (if any is awaiting) ──────────────────────────
  const checkpointStep = steps.find((s) => s.status === 'awaiting_approval');

  // ─── Renders ──────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ── Phase: Template selection ──────────────────────────── */}
      {phase === 'templates' && (
        <div className="p-3 space-y-3 overflow-y-auto">
          <h3
            className="text-[13px] font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Research Workflow
          </h3>
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Run an end-to-end research pipeline — from literature search to IEEE paper.
          </p>

          {/* Templates */}
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.template_id}
                onClick={() => {
                  setSelectedTemplate(t.template_id);
                  setPhase('goal');
                }}
                className="w-full text-left rounded-lg border p-3 transition-all hover:border-[var(--color-brand-primary)]"
                style={{
                  borderColor: 'var(--color-border-primary)',
                  background: 'var(--color-bg-tertiary)',
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} style={{ color: 'var(--color-brand-primary)' }} />
                  <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {t.title}
                  </span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t.description}
                </p>
                <div className="flex gap-3 mt-2">
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.step_count} steps
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    ~{t.estimated_minutes} min
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Or custom goal */}
          <button
            onClick={() => setPhase('goal')}
            className="w-full text-center text-[12px] py-2 rounded-lg transition-colors"
            style={{
              color: 'var(--color-brand-primary)',
              background: 'var(--color-bg-tertiary)',
            }}
          >
            Or describe a custom research goal...
          </button>
        </div>
      )}

      {/* ── Phase: Enter goal ──────────────────────────────────── */}
      {phase === 'goal' && (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Research Goal
            </h3>
            <button onClick={handleReset} className="p-1" title="Back">
              <X size={14} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
          {selectedTemplate && (
            <p className="text-[11px]" style={{ color: 'var(--color-brand-primary)' }}>
              Template: {templates.find((t) => t.template_id === selectedTemplate)?.title}
            </p>
          )}
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe your research objective, e.g.: 'Compare transformer-based approaches for medical image segmentation and identify research gaps'"
            className="w-full h-28 rounded-lg border p-3 text-[13px] resize-none focus:outline-none focus:ring-1"
            style={{
              borderColor: 'var(--color-border-primary)',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            onClick={handlePlan}
            disabled={goal.trim().length < 10}
            className="w-full py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-40"
            style={{
              background: 'var(--color-brand-primary)',
              color: 'var(--color-bg-primary)',
            }}
          >
            Plan Workflow
          </button>
        </div>
      )}

      {/* ── Phase: Planning ────────────────────────────────────── */}
      {phase === 'planning' && (
        <div className="flex items-center justify-center h-full gap-2">
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-brand-secondary)' }} />
          <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            Planning workflow...
          </span>
        </div>
      )}

      {/* ── Phase: Review plan ─────────────────────────────────── */}
      {phase === 'review' && plan && (
        <div className="p-3 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {plan.title}
            </h3>
            <button onClick={handleReset} className="p-1" title="Cancel">
              <X size={14} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {plan.description}
          </p>
          <div className="flex gap-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>{plan.steps.length} steps</span>
            <span>~{plan.estimated_minutes} min</span>
            <span>{plan.research_type}</span>
          </div>

          {/* Step list */}
          <div className="space-y-1">
            {steps.map((s) => (
              <div
                key={s.index}
                className="flex items-center gap-2 py-1.5 px-2 rounded"
                style={{ background: 'var(--color-bg-tertiary)' }}
              >
                <span className="text-[11px] w-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  {s.index + 1}
                </span>
                <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />
                <span className="text-[12px] flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {s.name}
                </span>
                {s.isCheckpoint && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--color-brand-primary)', color: 'var(--color-bg-primary)' }}
                  >
                    checkpoint
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="w-full py-2 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-2"
            style={{
              background: 'var(--color-brand-primary)',
              color: 'var(--color-bg-primary)',
            }}
          >
            <Play size={14} />
            Start Workflow
          </button>
        </div>
      )}

      {/* ── Phase: Running ─────────────────────────────────────── */}
      {phase === 'running' && (
        <div className="p-3 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {plan?.title || 'Running Workflow'}
            </h3>
            <button
              onClick={handleCancel}
              className="text-[11px] px-2 py-1 rounded"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
            >
              Cancel
            </button>
          </div>

          {/* Steps progress */}
          <div className="space-y-1">
            {steps.map((s) => (
              <div
                key={s.index}
                className="flex items-center gap-2 py-1.5 px-2 rounded"
                style={{
                  background: s.index === currentStep ? 'var(--color-bg-tertiary)' : 'transparent',
                }}
              >
                <StepStatusIcon status={s.status} />
                <span
                  className="text-[12px] flex-1"
                  style={{
                    color:
                      s.status === 'completed' || s.status === 'approved'
                        ? 'var(--color-text-secondary)'
                        : s.status === 'running'
                          ? 'var(--color-text-primary)'
                          : 'var(--color-text-muted)',
                  }}
                >
                  {s.name}
                </span>
                {s.status === 'completed' && (
                  <CheckCircle size={12} className="text-green-500" />
                )}
              </div>
            ))}
          </div>

          {/* Checkpoint approval UI */}
          {checkpointStep && (
            <div
              className="rounded-lg border p-3 space-y-2"
              style={{
                borderColor: 'var(--color-brand-primary)',
                background: 'var(--color-bg-tertiary)',
              }}
            >
              <div className="flex items-center gap-2">
                <Pause size={14} className="text-amber-400" />
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Checkpoint: {checkpointStep.name}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Review the output and approve to continue, or reject with feedback.
              </p>
              {checkpointStep.output && (
                <pre
                  className="text-[11px] max-h-60 overflow-y-auto rounded p-2 whitespace-pre-wrap"
                  style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
                >
                  {checkpointStep.output}
                </pre>
              )}
              <textarea
                value={checkpointFeedback}
                onChange={(e) => setCheckpointFeedback(e.target.value)}
                placeholder="Optional feedback..."
                className="w-full h-16 rounded border p-2 text-[12px] resize-none focus:outline-none"
                style={{
                  borderColor: 'var(--color-border-primary)',
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(checkpointStep.index)}
                  disabled={isLoading}
                  className="flex-1 py-1.5 rounded text-[12px] font-medium flex items-center justify-center gap-1"
                  style={{
                    background: 'var(--color-brand-primary)',
                    color: 'var(--color-bg-primary)',
                  }}
                >
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  onClick={() => handleReject(checkpointStep.index)}
                  disabled={isLoading}
                  className="flex-1 py-1.5 rounded text-[12px] font-medium flex items-center justify-center gap-1 border"
                  style={{
                    borderColor: 'var(--color-border-primary)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Phase: Completed ───────────────────────────────────── */}
      {phase === 'completed' && (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-green-500" />
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Workflow Complete
            </h3>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {plan?.title || 'Research workflow'} finished successfully.
          </p>

          {/* Show step outputs */}
          <div className="space-y-2">
            {steps.filter((s) => s.output).map((s) => (
              <div key={s.index} className="rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-tertiary)' }}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-green-500" />
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{s.name}</span>
                </div>
                <pre className="text-[11px] max-h-40 overflow-y-auto rounded p-2 whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}>
                  {s.output}
                </pre>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1"
              style={{
                background: 'var(--color-brand-primary)',
                color: 'var(--color-bg-primary)',
              }}
            >
              <RotateCcw size={12} /> New Workflow
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Error ───────────────────────────────────────── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
          <AlertCircle size={32} className="text-red-400" />
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Workflow Failed
          </h3>
          <p className="text-[12px] text-center" style={{ color: 'var(--color-text-muted)' }}>
            {error || 'An unknown error occurred.'}
          </p>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1"
            style={{
              background: 'var(--color-brand-primary)',
              color: 'var(--color-bg-primary)',
            }}
          >
            <RotateCcw size={12} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export default WorkflowPanel;
