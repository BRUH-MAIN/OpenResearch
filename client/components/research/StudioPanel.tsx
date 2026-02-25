'use client';

import React, { useState } from 'react';
import {
  PanelRightClose,
  Pin,
  Clock,
  Download,
  BrainCircuit,
  FileText,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { WorkspacePinnedNotes, PinnedNote } from './WorkspacePinnedNotes';
import { WorkspaceTimeline, TimelineEvent } from './WorkspaceTimeline';
import { WorkspaceExport } from './WorkspaceExport';
import { WorkspaceOutline } from './WorkspaceOutline';
import { Source } from './SourcesPanel';

// Keep exporting StudioOutput for backward compatibility
export interface StudioOutput {
  id: string;
  type: 'report';
  title: string;
  status: 'ready' | 'generating' | 'failed';
  createdAt: string;
  downloadUrl?: string;
}

type WorkspaceTab = 'notes' | 'timeline' | 'export' | 'outline';

interface StudioPanelProps {
  outputs: StudioOutput[];
  onGenerateReport: () => void;
  onDownloadOutput?: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  hasSourcesSelected?: boolean;
  className?: string;
  // New workspace props
  pinnedNotes?: PinnedNote[];
  onRemoveNote?: (noteId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  timelineEvents?: TimelineEvent[];
  sources?: Source[];
  outline?: string | null;
  isGeneratingOutline?: boolean;
  onGenerateOutline?: () => void;
  onCopy?: (text: string) => void;
  onToast?: (message: string) => void;
}

export function StudioPanel({
  outputs,
  onGenerateReport,
  onDownloadOutput,
  isCollapsed = false,
  onToggleCollapse,
  hasSourcesSelected = false,
  className = '',
  pinnedNotes = [],
  onRemoveNote,
  onScrollToMessage,
  timelineEvents = [],
  sources = [],
  outline = null,
  isGeneratingOutline = false,
  onGenerateOutline,
  onCopy,
  onToast,
}: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('notes');

  if (isCollapsed) {
    return (
      <div
        className={`w-[52px] border-l flex flex-col ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-4 transition-colors"
          title="Expand workspace"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--color-bg-tertiary)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'transparent')
          }
        >
          <PanelRightClose size={20} className="rotate-180" />
        </button>
        {pinnedNotes.length > 0 && (
          <div className="flex flex-col items-center px-1 pt-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--color-brand-primary)',
                fontSize: '10px',
                color: 'var(--color-text-primary)',
              }}
            >
              {pinnedNotes.length}
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabs: { key: WorkspaceTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: 'notes',
      label: 'Notes',
      icon: <Pin size={12} />,
      badge: pinnedNotes.length || undefined,
    },
    { key: 'timeline', label: 'Timeline', icon: <Clock size={12} /> },
    { key: 'export', label: 'Export', icon: <Download size={12} /> },
    { key: 'outline', label: 'Outline', icon: <BrainCircuit size={12} /> },
  ];

  return (
    <div
      className={`w-[340px] border-l flex flex-col h-full ${className}`}
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
          Workspace
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
      <div className="px-4 py-3">
        <button
          onClick={onGenerateReport}
          disabled={!hasSourcesSelected}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: hasSourcesSelected
              ? 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))'
              : 'var(--color-bg-tertiary)',
            color: hasSourcesSelected
              ? 'var(--color-bg-primary)'
              : 'var(--color-text-tertiary)',
            boxShadow: hasSourcesSelected ? 'var(--shadow-glow)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (hasSourcesSelected) {
              e.currentTarget.style.boxShadow = 'var(--shadow-glow-strong)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = hasSourcesSelected
              ? 'var(--shadow-glow)'
              : 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <FileText size={16} />
          Generate Report
        </button>
      </div>

      {/* Tabs */}
      <div className="workspace-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`workspace-tab ${activeTab === tab.key ? 'workspace-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <div className="flex items-center justify-center gap-1">
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && tab.badge > 0 && (
                <span
                  className="text-[9px] px-1 py-0 rounded-full"
                  style={{
                    background: 'var(--color-brand-primary)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto research-panel-scroll">
        {activeTab === 'notes' && (
          <WorkspacePinnedNotes
            notes={pinnedNotes}
            onRemoveNote={onRemoveNote || (() => { })}
            onScrollToMessage={onScrollToMessage || (() => { })}
          />
        )}

        {activeTab === 'timeline' && (
          <WorkspaceTimeline events={timelineEvents} />
        )}

        {activeTab === 'export' && (
          <WorkspaceExport
            sources={sources}
            hasReport={outputs.some((o) => o.status === 'ready')}
            onDownloadReport={onGenerateReport}
            onToast={onToast}
          />
        )}

        {activeTab === 'outline' && (
          <WorkspaceOutline
            outline={outline}
            isGenerating={isGeneratingOutline}
            onGenerate={onGenerateOutline || (() => { })}
            onCopy={onCopy}
          />
        )}
      </div>
    </div>
  );
}

export default StudioPanel;
