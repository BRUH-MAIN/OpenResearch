'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    BrainCircuit,
    Loader2,
    RefreshCw,
    Copy,
} from 'lucide-react';

interface WorkspaceOutlineProps {
    outline: string | null;
    isGenerating: boolean;
    onGenerate: () => void;
    onCopy?: (text: string) => void;
}

export function WorkspaceOutline({
    outline,
    isGenerating,
    onGenerate,
    onCopy,
}: WorkspaceOutlineProps) {
    if (!outline && !isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                >
                    <BrainCircuit size={26} style={{ color: 'var(--color-brand-secondary)' }} />
                </div>
                <p
                    className="text-[13px] font-medium mb-1.5"
                    style={{ color: 'var(--color-text-secondary)' }}
                >
                    AI Research Outline
                </p>
                <p
                    className="text-[12px] leading-relaxed mb-5"
                    style={{ color: 'var(--color-text-muted)' }}
                >
                    Generate a structured research outline based on your sources and conversation.
                </p>
                <button
                    onClick={onGenerate}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                    style={{
                        background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))',
                        color: 'var(--color-bg-primary)',
                        boxShadow: 'var(--shadow-glow)',
                    }}
                >
                    <BrainCircuit size={16} />
                    Generate Outline
                </button>
            </div>
        );
    }

    if (isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Loader2
                    size={32}
                    className="animate-spin mb-4"
                    style={{ color: 'var(--color-brand-secondary)' }}
                />
                <p
                    className="text-[13px] font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                >
                    Generating outline…
                </p>
                <p
                    className="text-[12px] mt-1"
                    style={{ color: 'var(--color-text-muted)' }}
                >
                    Analyzing your sources and conversation
                </p>
            </div>
        );
    }

    return (
        <div className="p-3">
            {/* Actions */}
            <div className="flex items-center justify-end gap-1 mb-3">
                <button
                    onClick={onGenerate}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    title="Regenerate"
                >
                    <RefreshCw size={12} />
                    Regenerate
                </button>
                {onCopy && outline && (
                    <button
                        onClick={() => onCopy(outline)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        title="Copy outline"
                    >
                        <Copy size={12} />
                        Copy
                    </button>
                )}
            </div>

            {/* Outline Content */}
            <div
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
            >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {outline || ''}
                </ReactMarkdown>
            </div>
        </div>
    );
}

export default WorkspaceOutline;
