'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  PanelRightClose,
  Pin,
  Workflow,
} from 'lucide-react';
import { WorkspacePinnedNotes, PinnedNote } from './WorkspacePinnedNotes';
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

export interface DetectedDiagram {
  id: string;
  code: string;
  detectedAt: string;
}

type WorkspaceTab = 'notes' | 'diagrams';

interface StudioPanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  width?: number;
  onResize?: (width: number) => void;
  variant?: 'sidebar' | 'overlay';
  // Notes
  pinnedNotes?: PinnedNote[];
  onRemoveNote?: (noteId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  // Diagrams
  detectedDiagrams?: DetectedDiagram[];
  // Deprecated / backward compat
  outputs?: StudioOutput[];
  sources?: Source[];
}

export function StudioPanel({
  isCollapsed = false,
  onToggleCollapse,
  className = '',
  width = 340,
  onResize,
  pinnedNotes = [],
  onRemoveNote,
  onScrollToMessage,
  detectedDiagrams = [],
  variant = 'sidebar',
}: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('notes');
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  // Drag-to-resize handler (drag from left edge)
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Dragging left = increasing width
        const delta = startX - ev.clientX;
        const newWidth = Math.max(300, Math.min(540, startWidth + delta));
        onResize?.(newWidth);
      };

      const onUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width, onResize]
  );

  if (variant === 'sidebar' && isCollapsed) {
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
    {
      key: 'diagrams',
      label: 'Diagrams',
      icon: <Workflow size={12} />,
      badge: detectedDiagrams.length || undefined,
    },
  ];

  return (
    <div
      className={variant === 'overlay'
        ? `flex flex-col self-stretch min-h-0 relative h-full w-full ${className}`
        : `border-l flex flex-col self-stretch min-h-0 relative ${className}`}
      style={{
        width: variant === 'overlay' ? '100%' : `${width}px`,
        minWidth: variant === 'overlay' ? '0' : `${width}px`,
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Resize handle */}
      {variant === 'sidebar' && onResize && (
        <div
          ref={resizeRef}
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-(--color-brand-primary)"
          style={{ opacity: 0.4 }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b"
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
          aria-label={variant === 'overlay' ? 'Close workspace panel' : 'Collapse workspace panel'}
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
            onRemoveNote={onRemoveNote || (() => {})}
            onScrollToMessage={onScrollToMessage || (() => {})}
          />
        )}

        {activeTab === 'diagrams' && (
          <div className="p-2.5 space-y-2.5">
            {detectedDiagrams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-5 text-center">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  <Workflow size={22} style={{ color: 'var(--color-text-muted)' }} />
                </div>
                <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  No diagrams yet
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Mermaid diagrams from AI responses will appear here automatically.
                </p>
              </div>
            ) : (
              detectedDiagrams.map((d) => (
                <div
                  key={d.id}
                  className="rounded-lg border p-2.5"
                  style={{
                    borderColor: 'var(--color-border-primary)',
                    background: 'var(--color-bg-tertiary)',
                  }}
                >
                  <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                    {d.code.slice(0, 300)}{d.code.length > 300 ? '…' : ''}
                  </pre>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(d.detectedAt).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default StudioPanel;
