'use client';

import React from 'react';
import {
  FileText,
  Plus,
  Check,
  Sparkles,
  File,
  Globe,
  BookOpen,
  PanelLeftClose,
  Loader2,
} from 'lucide-react';

export interface Source {
  id: string;
  type: 'paper' | 'web' | 'pdf' | 'note';
  title: string;
  authors?: string[];
  url?: string;
  abstract?: string;
  enabled: boolean;
  addedAt: string;
}

interface SourcesPanelProps {
  sources: Source[];
  onToggleSource: (id: string) => void;
  onToggleAll: (enabled: boolean) => void;
  onAddSource: () => void;
  onDeepResearch: () => void;
  isDeepResearching?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function SourcesPanel({
  sources,
  onToggleSource,
  onToggleAll,
  onAddSource,
  onDeepResearch,
  isDeepResearching = false,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}: SourcesPanelProps) {
  const allSelected = sources.length > 0 && sources.every((s) => s.enabled);
  const enabledCount = sources.filter((s) => s.enabled).length;

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'pdf':
        return <File size={16} style={{ color: 'var(--color-error)' }} />;
      case 'web':
        return <Globe size={16} style={{ color: 'var(--color-info)' }} />;
      case 'paper':
        return <BookOpen size={16} style={{ color: 'var(--color-success)' }} />;
      default:
        return <FileText size={16} style={{ color: 'var(--color-text-tertiary)' }} />;
    }
  };

  if (isCollapsed) {
    return (
      <div
        className={`w-[52px] border-r flex flex-col ${className}`}
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-primary)',
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-4 transition-colors"
          title="Expand sources"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <PanelLeftClose size={20} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-[340px] border-r flex flex-col h-full ${className}`}
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
        <div className="flex items-center gap-2">
          <span
            className="text-[15px] font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Sources
          </span>
          {sources.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded-full"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {enabledCount}/{sources.length}
            </span>
          )}
        </div>
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
          <PanelLeftClose size={18} />
        </button>
      </div>

      {/* Add Sources Button */}
      <div className="px-4 pt-4">
        <button
          onClick={onAddSource}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[14px] border transition-all"
          style={{
            borderColor: 'var(--color-border-secondary)',
            color: 'var(--color-text-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-brand-secondary)';
            e.currentTarget.style.background = 'var(--color-bg-tertiary)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(20, 255, 236, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <Plus size={18} />
          <span>Add sources</span>
        </button>
      </div>

      {/* Deep Research Banner */}
      <div className="px-4 pt-3">
        <button
          onClick={onDeepResearch}
          disabled={isDeepResearching}
          className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all text-left ${isDeepResearching ? 'animate-pulse cursor-not-allowed opacity-80' : ''
            }`}
          style={{
            background: 'rgba(13, 115, 119, 0.15)',
            border: '1px solid rgba(13, 115, 119, 0.3)',
          }}
          onMouseEnter={(e) => {
            if (!isDeepResearching) {
              e.currentTarget.style.background = 'rgba(13, 115, 119, 0.25)';
              e.currentTarget.style.borderColor = 'rgba(20, 255, 236, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(13, 115, 119, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(13, 115, 119, 0.3)';
          }}
        >
          {isDeepResearching ? (
            <Loader2
              size={18}
              className="shrink-0 animate-spin"
              style={{ color: 'var(--color-brand-secondary)' }}
            />
          ) : (
            <Sparkles
              size={18}
              className="shrink-0"
              style={{ color: 'var(--color-brand-secondary)' }}
            />
          )}
          <span
            className="text-[13px] leading-snug"
            style={{ color: 'var(--color-brand-secondary)' }}
          >
            {isDeepResearching ? (
              <span>Deep Research running…</span>
            ) : (
              <>
                Try <span className="font-semibold">Deep Research</span> for an in-depth report
              </>
            )}
          </span>
        </button>
      </div>

      {/* Select All */}
      <div
        className="flex items-center justify-between px-4 pt-5 pb-2"
      >
        <button
          onClick={() => onToggleAll(!allSelected)}
          className="flex items-center gap-2 text-[13px] transition-colors"
          style={{ color: 'var(--color-brand-secondary)' }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <span>{allSelected ? 'Deselect all' : 'Select all sources'}</span>
        </button>
        {allSelected && <Check size={16} style={{ color: 'var(--color-brand-secondary)' }} />}
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto research-panel-scroll">
        {sources.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <FileText size={24} style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <p
              className="text-[13px]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              No sources added yet
            </p>
            <p
              className="text-[12px] mt-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Add papers from your group collection
            </p>
          </div>
        ) : (
          <div className="px-2 pb-4">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => onToggleSource(source.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-left source-item-hover"
              >
                {/* Icon */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {getSourceIcon(source.type)}
                </div>

                {/* Title */}
                <span
                  className="flex-1 text-[13px] truncate leading-snug"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {source.title}
                </span>

                {/* Checkbox */}
                <div
                  className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all"
                  style={
                    source.enabled
                      ? {
                        background: 'var(--color-brand-primary)',
                        boxShadow: '0 0 8px rgba(13, 115, 119, 0.4)',
                      }
                      : {
                        border: '2px solid var(--color-border-secondary)',
                      }
                  }
                >
                  {source.enabled && (
                    <Check
                      size={14}
                      strokeWidth={3}
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SourcesPanel;
