'use client';

import React from 'react';
import {
  FileText,
  Sparkles,
  PanelRightClose,
  Download,
  Loader2,
  CalendarDays,
} from 'lucide-react';

export interface StudioOutput {
  id: string;
  type: 'report';
  title: string;
  status: 'ready' | 'generating' | 'failed';
  createdAt: string;
  downloadUrl?: string;
}

interface StudioPanelProps {
  outputs: StudioOutput[];
  onGenerateReport: () => void;
  onDownloadOutput?: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  hasSourcesSelected?: boolean;
  className?: string;
}

export function StudioPanel({
  outputs,
  onGenerateReport,
  onDownloadOutput,
  isCollapsed = false,
  onToggleCollapse,
  hasSourcesSelected = false,
  className = '',
}: StudioPanelProps) {
  if (isCollapsed) {
    return (
      <div className={`w-[52px] border-l flex flex-col ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-4 transition-colors"
          title="Expand outputs"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <PanelRightClose size={20} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-[320px] border-l flex flex-col h-full ${className}`}
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border-primary)' }}
      >
        <span
          className="text-[15px] font-medium"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Outputs
        </span>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded transition-colors"
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
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* Generate Report CTA */}
      <div className="px-4 py-4">
        <button
          onClick={onGenerateReport}
          disabled={!hasSourcesSelected}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: hasSourcesSelected
              ? 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))'
              : 'var(--color-bg-tertiary)',
            color: hasSourcesSelected ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
            boxShadow: hasSourcesSelected ? 'var(--shadow-glow)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (hasSourcesSelected) {
              e.currentTarget.style.boxShadow = 'var(--shadow-glow-strong)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = hasSourcesSelected ? 'var(--shadow-glow)' : 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <FileText size={18} />
          Generate Research Report
        </button>
        {!hasSourcesSelected && (
          <p
            className="text-[11px] text-center mt-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Select sources to generate a report
          </p>
        )}
      </div>

      {/* Outputs List */}
      <div className="flex-1 overflow-y-auto px-4">
        {outputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <Sparkles size={24} style={{ color: 'var(--color-brand-secondary)' }} />
            </div>
            <p
              className="text-[13px] font-medium mb-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              No outputs yet
            </p>
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Generate a research report from your selected sources to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {outputs.map((output) => (
              <div
                key={output.id}
                className="card-base p-3 flex items-center gap-3 transition-all"
                style={output.status === 'generating' ? { borderColor: 'var(--color-border-accent)' } : {}}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  {output.status === 'generating' ? (
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-brand-secondary)' }} />
                  ) : (
                    <FileText size={18} style={{ color: 'var(--color-brand-secondary)' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {output.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CalendarDays size={11} style={{ color: 'var(--color-text-muted)' }} />
                    <p
                      className="text-[11px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {new Date(output.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {output.status === 'ready' && output.downloadUrl && onDownloadOutput && (
                  <button
                    onClick={() => onDownloadOutput(output.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                      e.currentTarget.style.color = 'var(--color-brand-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    }}
                    title="Download report"
                  >
                    <Download size={16} />
                  </button>
                )}
                {output.status === 'failed' && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      color: 'var(--color-error)',
                      background: 'var(--color-error-bg)',
                    }}
                  >
                    Failed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudioPanel;
