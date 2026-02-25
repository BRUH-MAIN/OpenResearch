'use client';

import React from 'react';
import {
    Copy,
    FileText,
    Download,
    BookOpen,
    Check,
} from 'lucide-react';
import { Source } from './SourcesPanel';

interface WorkspaceExportProps {
    sources: Source[];
    onDownloadReport?: () => void;
    hasReport?: boolean;
    onToast?: (message: string) => void;
}

export function WorkspaceExport({
    sources,
    onDownloadReport,
    hasReport,
    onToast,
}: WorkspaceExportProps) {
    const enabledSources = sources.filter((s) => s.enabled);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        onToast?.(`${label} copied to clipboard`);
    };

    const generateCitationList = () => {
        return enabledSources
            .map((s, i) => {
                const authors = s.authors?.join(', ') || 'Unknown';
                const year = s.publishedDate
                    ? new Date(s.publishedDate).getFullYear()
                    : 'n.d.';
                return `[${i + 1}] ${authors} (${year}). "${s.title}."${s.url ? ` ${s.url}` : ''}`;
            })
            .join('\n\n');
    };

    const generateBibTeX = () => {
        return enabledSources
            .map((s) => {
                const firstAuthor = s.authors?.[0]?.split(' ').pop() || 'Unknown';
                const year = s.publishedDate
                    ? new Date(s.publishedDate).getFullYear()
                    : 'nd';
                const key = `${firstAuthor.toLowerCase()}${year}`;
                const authorStr = s.authors?.join(' and ') || 'Unknown';

                return `@article{${key},
  title = {${s.title}},
  author = {${authorStr}},
  year = {${year}}${s.url ? `,\n  url = {${s.url}}` : ''}
}`;
            })
            .join('\n\n');
    };

    const generateTitleList = () => {
        return enabledSources.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    };

    return (
        <div className="p-3 space-y-2">
            {enabledSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                        style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                        <BookOpen size={22} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                    <p
                        className="text-[13px] font-medium mb-1"
                        style={{ color: 'var(--color-text-secondary)' }}
                    >
                        No sources selected
                    </p>
                    <p
                        className="text-[12px] leading-relaxed"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        Select sources to export citations and references.
                    </p>
                </div>
            ) : (
                <>
                    <p
                        className="text-[11px] px-1 mb-1"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        {enabledSources.length} source{enabledSources.length !== 1 ? 's' : ''} selected
                    </p>

                    {/* Copy Titles */}
                    <button
                        className="export-tile"
                        onClick={() => copyToClipboard(generateTitleList(), 'Title list')}
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-bg-secondary)' }}
                        >
                            <Copy size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium">Copy titles</p>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                Plain text list of paper titles
                            </p>
                        </div>
                    </button>

                    {/* Citation List */}
                    <button
                        className="export-tile"
                        onClick={() => copyToClipboard(generateCitationList(), 'Citation list')}
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-bg-secondary)' }}
                        >
                            <FileText size={16} style={{ color: 'var(--color-brand-secondary)' }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium">Citation list</p>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                Formatted references (APA-style)
                            </p>
                        </div>
                    </button>

                    {/* BibTeX */}
                    <button
                        className="export-tile"
                        onClick={() => copyToClipboard(generateBibTeX(), 'BibTeX')}
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-bg-secondary)' }}
                        >
                            <BookOpen size={16} style={{ color: 'var(--color-info)' }} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium">BibTeX</p>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                Copy BibTeX entries for LaTeX
                            </p>
                        </div>
                    </button>

                    {/* Download Report */}
                    {hasReport && onDownloadReport && (
                        <button className="export-tile" onClick={onDownloadReport}>
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: 'var(--color-bg-secondary)' }}
                            >
                                <Download size={16} style={{ color: 'var(--color-success)' }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium">Download report</p>
                                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                    Latest generated research report
                                </p>
                            </div>
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default WorkspaceExport;
