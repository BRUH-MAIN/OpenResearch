'use client';

import React, { forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Copy, ThumbsUp, ThumbsDown, BookmarkPlus, User, Search, Database, Globe, Download, Layers, CheckCircle2, Loader2, BrainCircuit, FileSearch, Pin } from 'lucide-react';

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
  onFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
  onCopy?: (content: string) => void;
  onSaveToNotes?: (messageId: string) => void;
  onPin?: (messageId: string, content: string) => void;
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

export const ResearchMessage = forwardRef<HTMLDivElement, ResearchMessageProps>(
  (
    {
      id,
      content,
      type,
      userName,
      timestamp,
      citations,
      highlightedTerms = [],
      isCurrentUser,
      onFeedback,
      onCopy,
      onSaveToNotes,
      onPin,
      onCitationClick,
      className = '',
    },
    ref
  ) => {
    const isAI = type === 'ai';
    const isSystem = type === 'system';

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const getMarkdownContent = () => {
      if (highlightedTerms.length === 0) return content;

      let result = content;
      highlightedTerms.forEach((term) => {
        const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
        result = result.replace(regex, '**$1**');
      });

      return result;
    };

    const markdownComponents = {
      p: ({ children }: { children: React.ReactNode }) => (
        <p className="text-[14px] leading-relaxed mb-3 last:mb-0">{children}</p>
      ),
      a: ({ children, href }: { children: React.ReactNode; href?: string }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline transition-colors"
          style={{ color: 'var(--color-brand-secondary)' }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          {children}
        </a>
      ),
      code: ({ children }: { children: React.ReactNode }) => (
        <code
          className="px-1.5 py-0.5 rounded text-[13px]"
          style={{
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border-primary)',
            color: 'var(--color-brand-secondary)',
          }}
        >
          {children}
        </code>
      ),
      pre: ({ children }: { children: React.ReactNode }) => (
        <pre
          className="p-3 rounded-lg overflow-x-auto text-[13px] my-3"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-primary)',
          }}
        >
          {children}
        </pre>
      ),
      ul: ({ children }: { children: React.ReactNode }) => (
        <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>
      ),
      ol: ({ children }: { children: React.ReactNode }) => (
        <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>
      ),
      li: ({ children }: { children: React.ReactNode }) => (
        <li className="text-[14px] leading-relaxed">{children}</li>
      ),
      blockquote: ({ children }: { children: React.ReactNode }) => (
        <blockquote
          className="pl-3 my-3"
          style={{
            borderLeft: '3px solid var(--color-brand-primary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {children}
        </blockquote>
      ),
      h1: ({ children }: { children: React.ReactNode }) => (
        <h1
          className="text-[20px] font-medium mt-4 mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {children}
        </h1>
      ),
      h2: ({ children }: { children: React.ReactNode }) => (
        <h2
          className="text-[18px] font-medium mt-3 mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {children}
        </h2>
      ),
      h3: ({ children }: { children: React.ReactNode }) => (
        <h3
          className="text-[16px] font-medium mt-2 mb-1"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {children}
        </h3>
      ),
      hr: () => <hr className="divider my-3" />,
    };

    let agenticSteps: any[] | null = null;
    if (isAI && content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.agentic_steps)) {
          agenticSteps = parsed.agentic_steps;
        }
      } catch (e) {
        // ignore if not valid JSON
      }
    }

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

    const renderAgenticSteps = (steps: any[]) => {
      return (
        <div className="space-y-3 my-2 w-full max-w-md">
          {steps.map((step, idx) => {
            const isActive = step.status === 'active';
            const isDone = step.status === 'done';
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isActive ? 'bg-[#1a2b3c] border-[#2c4b6b]' : 'bg-[#1e1e1e] border-[#333]'}`}
                style={{
                  background: isActive ? 'var(--color-bg-elevated)' : 'var(--color-bg-tertiary)',
                  borderColor: isActive ? 'var(--color-brand-secondary)' : 'var(--color-border-primary)',
                  boxShadow: isActive ? '0 0 10px rgba(20, 255, 236, 0.1)' : 'none'
                }}
              >
                <div className="flex-shrink-0">
                  {getIconForStep(step.icon, step.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] ${isActive ? 'font-medium' : ''}`} style={{ color: isActive ? 'var(--color-text-primary)' : (isDone ? 'var(--color-text-secondary)' : 'var(--color-text-muted)') }}>
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className="text-[12px] truncate mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    // System messages
    if (isSystem) {
      return (
        <div ref={ref} className={`flex justify-center py-4 ${className}`}>
          <div
            className="px-4 py-2 rounded-full"
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
        <div ref={ref} className={`group py-6 animate-fade-in-up ${className}`}>
          {/* AI Avatar */}
          <div className="flex items-start gap-4 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <Bot size={22} style={{ color: 'var(--color-brand-primary)' }} />
            </div>
            <div className="flex-1 min-w-0 pt-2">
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Research Assistant
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="pl-14">
            <div style={{ color: 'var(--color-text-secondary)' }} className="whitespace-pre-wrap">
              {agenticSteps ? (
                renderAgenticSteps(agenticSteps)
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {getMarkdownContent()}
                </ReactMarkdown>
              )}
            </div>

            {/* Citations */}
            {citations && citations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
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
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      );
    }

    // User Message
    return (
      <div ref={ref} className={`py-4 animate-fade-in ${className}`}>
        <div className="flex items-start gap-4">
          {/* User Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-bg-elevated)' }}
          >
            <User size={20} style={{ color: 'var(--color-text-primary)' }} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
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
            </div>

            {/* Content */}
            <div style={{ color: 'var(--color-text-primary)' }} className="whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {getMarkdownContent()}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ResearchMessage.displayName = 'ResearchMessage';

export default ResearchMessage;
