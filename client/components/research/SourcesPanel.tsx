'use client';

import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  ChevronDown,
  Check,
  Sparkles,
  Globe,
  ArrowRight,
  File,
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
  onWebSearch: (query: string) => void;
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
  onWebSearch,
  isDeepResearching = false,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}: SourcesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const allSelected = sources.length > 0 && sources.every((s) => s.enabled);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onWebSearch(searchQuery.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'pdf':
        return <File size={16} className="text-[#ea4335]" />;
      case 'web':
        return <Globe size={16} className="text-[#8ab4f8]" />;
      case 'paper':
        return <BookOpen size={16} className="text-[#81c995]" />;
      default:
        return <FileText size={16} className="text-[#9aa0a6]" />;
    }
  };

  if (isCollapsed) {
    return (
      <div className={`w-[52px] bg-[#1e1f20] border-r border-[#3c4043] flex flex-col ${className}`}>
        <button
          onClick={onToggleCollapse}
          className="p-4 hover:bg-[#28292a] transition-colors"
          title="Expand sources"
        >
          <PanelLeftClose size={20} className="text-[#9aa0a6] rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className={`w-[360px] bg-[#1e1f20] border-r border-[#3c4043] flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c4043]">
        <span className="text-[15px] font-medium text-[#e8eaed]">Sources</span>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-[#28292a] text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      {/* Add Sources Button */}
      <div className="px-4 pt-4">
        <button
          onClick={onAddSource}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-[#5f6368] hover:border-[#8ab4f8] hover:bg-[#28292a] rounded-full text-[14px] text-[#e8eaed] transition-all"
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
          className={`w-full flex items-center gap-2.5 px-4 py-3 bg-[#0d3d3d] hover:bg-[#134545] border border-[#1a5c5c] rounded-xl transition-colors text-left ${
            isDeepResearching ? 'animate-pulse cursor-not-allowed opacity-80' : ''
          }`}
        >
          {isDeepResearching ? (
            <Loader2 size={18} className="text-[#81c995] shrink-0 animate-spin" />
          ) : (
            <Sparkles size={18} className="text-[#81c995] shrink-0" />
          )}
          <span className="text-[13px] text-[#81c995] leading-snug">
            {isDeepResearching ? (
              <span>Deep Research is running...</span>
            ) : (
              <>
                Try <span className="font-semibold">Deep Research</span> for an in-depth report and new sources!
              </>
            )}
          </span>
        </button>
      </div>

      {/* Web Search */}
      <div className="px-4 pt-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9aa0a6]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the web for new sources"
            className="w-full bg-[#28292a] border border-[#3c4043] rounded-full pl-11 pr-4 py-2.5 text-[14px] text-[#e8eaed] placeholder:text-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8] transition-colors"
          />
        </div>

        {/* Search Options Row */}
        <div className="flex items-center gap-2 mt-3">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[13px] text-[#e8eaed] transition-colors">
            <Globe size={14} />
            <span>Web</span>
            <ChevronDown size={12} className="ml-0.5" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[13px] text-[#e8eaed] transition-colors">
            <Sparkles size={14} />
            <span>Fast research</span>
            <ChevronDown size={12} className="ml-0.5" />
          </button>
          <button
            onClick={handleSearch}
            className="ml-auto p-2 bg-[#28292a] hover:bg-[#3c4043] border border-[#3c4043] rounded-full text-[#9aa0a6] hover:text-[#e8eaed] transition-colors"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Select All */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <button
          onClick={() => onToggleAll(!allSelected)}
          className="flex items-center gap-2 text-[13px] text-[#8ab4f8] hover:text-[#aecbfa] transition-colors"
        >
          <span>Select all sources</span>
        </button>
        {allSelected && <Check size={16} className="text-[#8ab4f8]" />}
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText size={36} className="mx-auto text-[#5f6368] mb-3" />
            <p className="text-[13px] text-[#9aa0a6]">No sources added yet</p>
            <p className="text-[12px] text-[#5f6368] mt-1">Add papers or search the web</p>
          </div>
        ) : (
          <div className="px-2 pb-4">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => onToggleSource(source.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#28292a] transition-colors group text-left"
              >
                {/* Icon */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {getSourceIcon(source.type)}
                </div>

                {/* Title */}
                <span className="flex-1 text-[13px] text-[#e8eaed] truncate leading-snug">
                  {source.title}
                </span>

                {/* Checkbox */}
                <div
                  className={`shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    source.enabled
                      ? 'bg-[#8ab4f8]'
                      : 'border-2 border-[#5f6368] group-hover:border-[#9aa0a6]'
                  }`}
                >
                  {source.enabled && <Check size={14} className="text-[#1e1f20]" strokeWidth={3} />}
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
