'use client';

import React from 'react';
import { Bot, Sliders, MoreVertical, Copy, ThumbsUp, ThumbsDown, BookmarkPlus } from 'lucide-react';

interface ChatHeaderProps {
  onSettings?: () => void;
  onMore?: () => void;
  className?: string;
}

export function ChatHeader({ onSettings, onMore, className = '' }: ChatHeaderProps) {
  return (
    <div className={`flex items-center justify-between px-6 py-3 border-b border-[#3c4043] ${className}`}>
      <span className="text-[15px] font-medium text-[#e8eaed]">Chat</span>
      <div className="flex items-center gap-1">
        {onSettings && (
          <button
            onClick={onSettings}
            className="p-2 rounded-full hover:bg-[#28292a] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
          >
            <Sliders size={18} />
          </button>
        )}
        {onMore && (
          <button
            onClick={onMore}
            className="p-2 rounded-full hover:bg-[#28292a] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
          >
            <MoreVertical size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

interface AIResponseCardProps {
  title: string;
  sourcesCount: number;
  summary: string;
  highlightedTerms?: string[];
  suggestedQuestions: string[];
  onSaveToNote: () => void;
  onCopy: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onSelectQuestion: (question: string) => void;
  className?: string;
}

export function AIResponseCard({
  title,
  sourcesCount,
  summary,
  highlightedTerms = [],
  suggestedQuestions,
  onSaveToNote,
  onCopy,
  onThumbsUp,
  onThumbsDown,
  onSelectQuestion,
  className = '',
}: AIResponseCardProps) {
  // Function to highlight terms in the summary
  const renderHighlightedSummary = () => {
    if (highlightedTerms.length === 0) return summary;

    let result = summary;
    const parts: React.ReactNode[] = [];
    const lastIndex = 0;

    // Simple highlighting - in production you'd want a more robust solution
    highlightedTerms.forEach((term) => {
      const regex = new RegExp(`(${term})`, 'gi');
      result = result.replace(regex, `<mark>$1</mark>`);
    });

    return (
      <span
        dangerouslySetInnerHTML={{
          __html: result.replace(
            /<mark>(.*?)<\/mark>/g,
            '<span class="font-semibold text-[#e8eaed]">$1</span>'
          ),
        }}
      />
    );
  };

  return (
    <div className={`px-6 py-6 ${className}`}>
      {/* AI Avatar */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-[#28292a] flex items-center justify-center flex-shrink-0">
          <Bot size={28} className="text-[#ea4335]" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[28px] font-normal text-[#e8eaed] leading-tight mb-3">
        {title}
      </h1>

      {/* Sources Count */}
      <p className="text-[13px] text-[#9aa0a6] mb-4">
        {sourcesCount} sources
      </p>

      {/* Summary */}
      <p className="text-[14px] text-[#9aa0a6] leading-relaxed mb-5">
        {renderHighlightedSummary()}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 mb-8">
        <button
          onClick={onSaveToNote}
          className="flex items-center gap-2 px-4 py-2 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[13px] text-[#e8eaed] transition-colors"
        >
          <BookmarkPlus size={16} />
          <span>Save to note</span>
        </button>
        <button
          onClick={onCopy}
          className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
        >
          <Copy size={18} />
        </button>
        <button
          onClick={onThumbsUp}
          className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
        >
          <ThumbsUp size={18} />
        </button>
        <button
          onClick={onThumbsDown}
          className="p-2.5 hover:bg-[#28292a] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
        >
          <ThumbsDown size={18} />
        </button>
      </div>

      {/* Suggested Questions */}
      <div className="space-y-2">
        {suggestedQuestions.map((question, index) => (
          <button
            key={index}
            onClick={() => onSelectQuestion(question)}
            className="w-full text-left px-4 py-3 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] hover:border-[#5f6368] rounded-xl text-[14px] text-[#e8eaed] transition-all"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sourcesCount: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  sourcesCount,
  disabled = false,
  placeholder = 'Start typing...',
  className = '',
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className={`px-6 py-4 border-t border-[#3c4043] ${className}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-[#28292a] border border-[#3c4043] rounded-full focus-within:border-[#8ab4f8] transition-colors">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-[14px] text-[#e8eaed] placeholder:text-[#9aa0a6] focus:outline-none disabled:opacity-50"
        />
        
        {/* Sources Badge */}
        <span className="px-2 py-1 bg-[#3c4043] rounded-full text-[12px] text-[#9aa0a6]">
          {sourcesCount} sources
        </span>
        
        {/* Send Button */}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="p-1.5 bg-[#8ab4f8] hover:bg-[#aecbfa] rounded-full text-[#1e1f20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      {/* Disclaimer */}
      <p className="text-[11px] text-[#5f6368] text-center mt-2">
        NotebookLM can be inaccurate; please double-check its responses.
      </p>
    </div>
  );
}

export default { ChatHeader, AIResponseCard, ChatInput };
