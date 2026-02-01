'use client';

import React, { forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Copy, ThumbsUp, ThumbsDown, BookmarkPlus, User } from 'lucide-react';

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
        <p className="text-[14px] leading-relaxed">{children}</p>
      ),
      a: ({ children, href }: { children: React.ReactNode; href?: string }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[#8ab4f8] hover:text-[#aecbfa] underline"
        >
          {children}
        </a>
      ),
      code: ({ children }: { children: React.ReactNode }) => (
        <code className="px-1.5 py-0.5 bg-[#1f1f1f] border border-[#3c4043] rounded text-[13px]">
          {children}
        </code>
      ),
      pre: ({ children }: { children: React.ReactNode }) => (
        <pre className="p-3 bg-[#1f1f1f] border border-[#3c4043] rounded-lg overflow-x-auto text-[13px]">
          {children}
        </pre>
      ),
      ul: ({ children }: { children: React.ReactNode }) => (
        <ul className="list-disc pl-5 space-y-1">{children}</ul>
      ),
      ol: ({ children }: { children: React.ReactNode }) => (
        <ol className="list-decimal pl-5 space-y-1">{children}</ol>
      ),
      li: ({ children }: { children: React.ReactNode }) => (
        <li className="text-[14px] leading-relaxed">{children}</li>
      ),
      blockquote: ({ children }: { children: React.ReactNode }) => (
        <blockquote className="border-l-2 border-[#5f6368] pl-3 text-[#9aa0a6]">{children}</blockquote>
      ),
      h1: ({ children }: { children: React.ReactNode }) => (
        <h1 className="text-[20px] font-medium text-[#e8eaed]">{children}</h1>
      ),
      h2: ({ children }: { children: React.ReactNode }) => (
        <h2 className="text-[18px] font-medium text-[#e8eaed]">{children}</h2>
      ),
      h3: ({ children }: { children: React.ReactNode }) => (
        <h3 className="text-[16px] font-medium text-[#e8eaed]">{children}</h3>
      ),
      hr: () => <hr className="border-[#3c4043] my-3" />,
    };

    // System messages
    if (isSystem) {
      return (
        <div ref={ref} className={`flex justify-center py-4 ${className}`}>
          <div className="px-4 py-2 bg-[#28292a] border border-[#3c4043] rounded-full">
            <p className="text-[12px] text-[#9aa0a6]">{content}</p>
          </div>
        </div>
      );
    }

    // AI Response
    if (isAI) {
      return (
        <div ref={ref} className={`group py-6 ${className}`}>
          {/* AI Avatar */}
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#28292a] flex items-center justify-center flex-shrink-0">
              <Bot size={22} className="text-[#ea4335]" />
            </div>
            <div className="flex-1 min-w-0 pt-2">
              <span className="text-[13px] font-medium text-[#9aa0a6]">Research Assistant</span>
            </div>
          </div>

          {/* Content */}
          <div className="pl-14">
            <div className="text-[#bdc1c6] whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {getMarkdownContent()}
              </ReactMarkdown>
            </div>

            {/* Citations */}
            {citations && citations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {citations.map((citation, index) => (
                  <button
                    key={citation.id}
                    onClick={() => onCitationClick?.(citation)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-lg text-[12px] text-[#8ab4f8] hover:text-[#aecbfa] transition-colors"
                  >
                    <span className="font-medium">[{index + 1}]</span>
                    <span className="text-[#9aa0a6] truncate max-w-[150px]">{citation.sourceTitle}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onSaveToNotes && (
                <button
                  onClick={() => onSaveToNotes(id)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[12px] text-[#e8eaed] transition-colors"
                >
                  <BookmarkPlus size={14} />
                  <span>Save to note</span>
                </button>
              )}
              {onCopy && (
                <button
                  onClick={() => onCopy(content)}
                  className="p-2 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
                  title="Copy"
                >
                  <Copy size={16} />
                </button>
              )}
              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback(id, 'up')}
                    className="p-2 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
                    title="Helpful"
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    onClick={() => onFeedback(id, 'down')}
                    className="p-2 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
                    title="Not helpful"
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
      <div ref={ref} className={`py-4 ${className}`}>
        <div className="flex items-start gap-4">
          {/* User Avatar */}
          <div className="w-10 h-10 rounded-full bg-[#5f6368] flex items-center justify-center flex-shrink-0">
            <User size={20} className="text-[#e8eaed]" />
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] font-medium text-[#e8eaed]">
                {userName || 'You'}
              </span>
              <span className="text-[12px] text-[#5f6368]">
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Content */}
            <div className="text-[#e8eaed] whitespace-pre-wrap">
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
