'use client';

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Check,
  File,
  Globe,
  BookOpen,
  PanelLeftClose,
  Search,
  ChevronDown,
  ExternalLink,
  Bot,
  Trash2,
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
  tags?: string[];
  publishedDate?: string;
}

interface SourcesPanelProps {
  sources: Source[];
  onToggleSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onToggleAll: (enabled: boolean) => void;
  onAddSource: () => void;
  selectedAgent: string;
  onAgentChange: (agent: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  variant?: 'sidebar' | 'overlay';
}

const AGENT_OPTIONS = [
  { value: 'auto', label: 'Auto (AI decides)', description: 'Intent classifier routes automatically' },
  { value: 'deep_research', label: 'Deep Research', description: 'Comprehensive multi-source research' },
  { value: 'literature_survey', label: 'Literature Survey', description: 'Systematic literature review' },
  { value: 'gap_analysis', label: 'Gap Analysis', description: 'Identify research gaps' },
  { value: 'fact_check', label: 'Fact Check', description: 'Verify claims against evidence' },
  { value: 'novelty_assessment', label: 'Novelty Assessment', description: 'Evaluate idea novelty' },
  { value: 'research_mentor', label: 'Research Mentor', description: 'Guidance and advice' },
  { value: 'paper_writing', label: 'Paper Writing', description: 'Draft paper sections' },
  { value: 'methodology_extraction', label: 'Structured Comparison', description: 'Compare architectures, methods, datasets, metrics, and findings' },
];

export function SourcesPanel({
  sources,
  onToggleSource,
  onDeleteSource,
  onToggleAll,
  onAddSource,
  selectedAgent,
  onAgentChange,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
  variant = 'sidebar',
}: SourcesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  const allSelected = sources.length > 0 && sources.every((s) => s.enabled);
  const enabledCount = sources.filter((s) => s.enabled).length;

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const q = searchQuery.toLowerCase();
    return sources.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.authors?.some((a) => a.toLowerCase().includes(q)) ||
        s.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [sources, searchQuery]);

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

  const formatAuthors = (authors?: string[]) => {
    if (!authors || authors.length === 0) return null;
    if (authors.length <= 2) return authors.join(', ');
    return `${authors[0]}, ${authors[1]} et al.`;
  };

  const formatYear = (date?: string) => {
    if (!date) return null;
    try {
      return new Date(date).getFullYear().toString();
    } catch {
      return null;
    }
  };

  const isIndexed = (source: Source) => !!source.abstract && source.abstract.length > 20;

  if (variant === 'sidebar' && isCollapsed) {
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
        {sources.length > 0 && (
          <div className="flex flex-col items-center px-1 pt-2">
            <span
              className="text-[11px] font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {enabledCount}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={variant === 'overlay'
        ? `w-full border-r-0 flex flex-col self-stretch min-h-0 h-full ${className}`
        : `w-[296px] xl:w-[320px] border-r flex flex-col self-stretch min-h-0 ${className}`}
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b"
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
          aria-label={variant === 'overlay' ? 'Close sources panel' : 'Collapse sources panel'}
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

      {/* Search Bar */}
      <div className="px-3 pt-2.5">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
          style={{
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border-primary)',
          }}
        >
          <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sources…"
            className="flex-1 bg-transparent text-[13px] focus:outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[11px] px-1.5 py-0.5 rounded transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Add Sources + Agent Selector */}
      <div className="px-3 pt-2.5 flex flex-col gap-2">
        <button
          onClick={onAddSource}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] border transition-all w-full"
          style={{
            borderColor: 'var(--color-border-secondary)',
            color: 'var(--color-text-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-brand-secondary)';
            e.currentTarget.style.background = 'var(--color-bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Plus size={16} />
          <span>Add Source</span>
        </button>

        {/* Agent Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
            className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg text-[13px] transition-all"
            style={{
              background: 'rgba(13, 115, 119, 0.15)',
              border: '1px solid rgba(13, 115, 119, 0.3)',
              color: 'var(--color-brand-secondary)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Bot size={16} />
              <span>{AGENT_OPTIONS.find(a => a.value === selectedAgent)?.label || 'Auto'}</span>
            </div>
            <ChevronDown
              size={14}
              style={{
                transform: agentDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>

          {agentDropdownOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-xl py-1 z-50 max-h-[280px] overflow-y-auto research-panel-scroll"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-primary)',
              }}
            >
              {AGENT_OPTIONS.map((agent) => (
                <button
                  key={agent.value}
                  onClick={() => {
                    onAgentChange(agent.value);
                    setAgentDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 transition-colors flex flex-col"
                  style={{
                    background: selectedAgent === agent.value ? 'rgba(13, 115, 119, 0.1)' : 'transparent',
                    borderLeft: selectedAgent === agent.value ? '2px solid var(--color-brand-secondary)' : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedAgent !== agent.value) {
                      e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedAgent === agent.value ? 'rgba(13, 115, 119, 0.1)' : 'transparent';
                  }}
                >
                  <span
                    className="text-[13px] font-medium"
                    style={{
                      color: selectedAgent === agent.value ? 'var(--color-brand-secondary)' : 'var(--color-text-primary)',
                    }}
                  >
                    {agent.label}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {agent.description}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Select All */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <button
          onClick={() => onToggleAll(!allSelected)}
          className="flex items-center gap-2 text-[12px] transition-colors"
          style={{ color: 'var(--color-brand-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
        </button>
        {searchQuery && (
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {filteredSources.length} of {sources.length}
          </span>
        )}
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto research-panel-scroll px-2.5 pb-2.5">
        {filteredSources.length === 0 ? (
          <div className="px-2 py-12 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              {searchQuery ? (
                <Search size={24} style={{ color: 'var(--color-text-muted)' }} />
              ) : (
                <FileText size={24} style={{ color: 'var(--color-text-muted)' }} />
              )}
            </div>
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              {searchQuery ? 'No matching sources' : 'No sources added yet'}
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {searchQuery ? 'Try a different search term' : 'Add papers from your group collection'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 pt-1.5">
            {filteredSources.map((source) => {
              const isExpanded = expandedId === source.id;
              const authors = formatAuthors(source.authors);
              const year = formatYear(source.publishedDate);
              const indexed = isIndexed(source);

              return (
                <div
                  key={source.id}
                  className={`source-card ${isExpanded ? 'source-card--expanded' : ''}`}
                >
                  {/* Card Header */}
                  <div
                    className="flex items-start gap-2.5 p-2.5 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : source.id)}
                  >
                    {/* Icon + Health */}
                    <div className="flex flex-col items-center gap-1.5 pt-0.5 shrink-0">
                      {getSourceIcon(source.type)}
                      <div
                        className={`source-health-dot ${indexed ? 'source-health-dot--indexed' : 'source-health-dot--partial'}`}
                        title={indexed ? 'Indexed for AI' : 'Title only'}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[12.5px] font-medium leading-snug line-clamp-2"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {source.title}
                      </p>

                      {/* Authors + Year */}
                      {(authors || year) && (
                        <p
                          className="text-[11px] mt-1 truncate"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {[authors, year].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      {/* Abstract Preview (collapsed) */}
                      {!isExpanded && source.abstract && (
                        <p
                          className="text-[11px] mt-1 line-clamp-2 leading-relaxed"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {source.abstract}
                        </p>
                      )}

                      {/* Tags */}
                      {source.tags && source.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {source.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="tag-pill">{tag}</span>
                          ))}
                          {source.tags.length > 3 && (
                            <span className="tag-pill">+{source.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right side: checkbox + expand */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSource(source.id);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center transition-all"
                        title="Remove source"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                          e.currentTarget.style.color = 'var(--color-error)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-text-tertiary)';
                        }}
                      >
                        <Trash2 size={12} />
                      </button>

                      {/* Selection Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSource(source.id);
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center transition-all"
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
                      </button>

                      {/* Expand indicator */}
                      <ChevronDown
                        size={14}
                        style={{
                          color: 'var(--color-text-muted)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <div className="source-card-detail">
                    {/* Full Abstract */}
                    {source.abstract && (
                      <div className="mb-3">
                        <p
                          className="text-[11px] font-medium mb-1"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          Abstract
                        </p>
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {source.abstract}
                        </p>
                      </div>
                    )}

                    {/* All Authors */}
                    {source.authors && source.authors.length > 2 && (
                      <div className="mb-3">
                        <p
                          className="text-[11px] font-medium mb-1"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          Authors
                        </p>
                        <p
                          className="text-[12px]"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {source.authors.join(', ')}
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex gap-2 pt-1">
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                          style={{
                            background: 'var(--color-bg-secondary)',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border-primary)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={12} />
                          View paper
                        </a>
                      )}
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                        style={{
                          background: 'var(--color-bg-secondary)',
                          color: 'var(--color-brand-secondary)',
                          border: '1px solid var(--color-border-primary)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Bot size={12} />
                        Ask AI
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SourcesPanel;
