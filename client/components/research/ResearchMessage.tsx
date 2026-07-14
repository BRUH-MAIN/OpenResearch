'use client';

import React, { memo } from 'react';
import { Bot, Copy, ThumbsUp, ThumbsDown, User, Pin, FileText, ExternalLink } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { RagSource } from '@/lib/api';

export type Citation = RagSource;

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
  className?: string;
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
  className = '',
}: ResearchMessageProps) {
    const isAI = type === 'ai';
    const isSystem = type === 'system';

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
                  <MarkdownRenderer content={getMarkdownContent()} isStreaming={isStreaming} onDiagramDetected={onDiagramDetected} />
                </div>

                {/* Citations — the chunks retrieved by hybrid search that grounded this answer */}
                {citations && citations.length > 0 && (
                  <div className="mt-5 pt-4 research-ai-card-divider">
                    <p className="text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--color-text-muted)' }}>
                      Grounded in {citations.length} source{citations.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {citations.map((citation, index) => (
                        <button
                          key={citation.id}
                          onClick={() => onCitationClick?.(citation)}
                          title={citation.title || citation.type}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all"
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border-primary)',
                            color: 'var(--color-brand-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)';
                          }}
                        >
                          <span className="font-medium">[{index + 1}]</span>
                          <FileText size={12} />
                          <span
                            className="truncate max-w-40"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {citation.title || citation.type}
                          </span>
                          {citation.similarity > 0 && (
                            <span
                              className="tabular-nums text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                background: 'var(--color-bg-secondary)',
                                color: 'var(--color-text-muted)',
                              }}
                              title="Retrieval score"
                            >
                              {citation.similarity.toFixed(2)}
                            </span>
                          )}
                          {citation.url && <ExternalLink size={11} />}
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
