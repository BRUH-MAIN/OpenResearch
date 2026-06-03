'use client';

import React, { useEffect, useRef } from 'react';
import {
    Bot,
    FileText,
    GitCompare,
    Search,
    AlertTriangle,
    BookOpen,
    Zap,
    MessagesSquare,
} from 'lucide-react';

export interface Command {
    id: string;
    prefix: string;
    label: string;
    description: string;
    icon: React.ReactNode;
}

export const COMMANDS: Command[] = [
    {
        id: 'workflow',
        prefix: '/workflow',
        label: 'Workflow Plan',
        description: 'Plan a workflow: /workflow <goal>',
        icon: <Bot size={16} />,
    },
    {
        id: 'literature_survey',
        prefix: '/literature_survey',
        label: 'Literature Survey',
        description: 'Run literature survey: /literature_survey <prompt>',
        icon: <FileText size={16} />,
    },
    {
        id: 'gap_analysis',
        prefix: '/gap_analysis',
        label: 'Gap Analysis',
        description: 'Run gap analysis: /gap_analysis <prompt>',
        icon: <GitCompare size={16} />,
    },
    {
        id: 'fact_check',
        prefix: '/fact_check',
        label: 'Fact Check',
        description: 'Run fact check: /fact_check <prompt>',
        icon: <Search size={16} />,
    },
    {
        id: 'novelty_assessment',
        prefix: '/novelty_assessment',
        label: 'Novelty Assessment',
        description: 'Assess novelty: /novelty_assessment <prompt>',
        icon: <BookOpen size={16} />,
    },
    {
        id: 'deep_research',
        prefix: '/deep_research',
        label: 'Deep Research',
        description: 'Run deep research: /deep_research <prompt>',
        icon: <AlertTriangle size={16} />,
    },
    {
        id: 'research_mentor',
        prefix: '/research_mentor',
        label: 'Research Mentor',
        description: 'Get mentoring guidance: /research_mentor <prompt>',
        icon: <Bot size={16} />,
    },
    {
        id: 'paper_writing',
        prefix: '/paper_writing',
        label: 'Paper Writing',
        description: 'Draft paper content: /paper_writing <prompt>',
        icon: <FileText size={16} />,
    },
    {
        id: 'methodology_extraction',
        prefix: '/methodology_extraction',
        label: 'Structured Comparison',
        description: 'Build a comparison matrix: /methodology_extraction <prompt>',
        icon: <GitCompare size={16} />,
    },
    {
        id: 'paper_retrieval',
        prefix: '/paper_retrieval',
        label: 'Paper Retrieval',
        description: 'Find relevant papers: /paper_retrieval <prompt>',
        icon: <BookOpen size={16} />,
    },
];

interface CommandPaletteProps {
    query: string;
    activeIndex: number;
    onSelect: (command: Command) => void;
}

export function CommandPalette({
    query,
    activeIndex,
    onSelect,
}: CommandPaletteProps) {
    const listRef = useRef<HTMLDivElement>(null);

    const filteredCommands = COMMANDS.filter(
        (cmd) =>
            cmd.prefix.toLowerCase().includes(query.toLowerCase()) ||
            cmd.label.toLowerCase().includes(query.toLowerCase())
    );

    // Scroll active item into view
    useEffect(() => {
        const activeEl = listRef.current?.children[activeIndex] as HTMLElement;
        activeEl?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    if (filteredCommands.length === 0) return null;

    return (
        <div className="command-palette" ref={listRef}>
            <div
                className="px-3 py-2 border-b"
                style={{ borderColor: 'var(--color-border-primary)' }}
            >
                <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Commands
                </p>
            </div>
            {filteredCommands.map((cmd, index) => (
                <button
                    key={cmd.id}
                    className={`command-item ${index === activeIndex ? 'command-item--active' : ''}`}
                    onClick={() => onSelect(cmd)}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <div className="command-item-icon">{cmd.icon}</div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium">{cmd.label}</span>
                            <span
                                className="text-[11px] px-1.5 py-0.5 rounded"
                                style={{
                                    background: 'var(--color-bg-tertiary)',
                                    color: 'var(--color-text-muted)',
                                }}
                            >
                                {cmd.prefix}
                            </span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            {cmd.description}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
}

export default CommandPalette;
