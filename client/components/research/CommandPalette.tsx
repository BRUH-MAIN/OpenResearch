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
        id: 'ai',
        prefix: '@ai',
        label: 'Ask AI',
        description: 'Ask a research question to the AI assistant',
        icon: <Bot size={16} />,
    },
    {
        id: 'summarize',
        prefix: '/summarize',
        label: 'Summarize',
        description: 'Summarize selected sources',
        icon: <FileText size={16} />,
    },
    {
        id: 'compare',
        prefix: '/compare',
        label: 'Compare',
        description: 'Compare methodologies across papers',
        icon: <GitCompare size={16} />,
    },
    {
        id: 'gaps',
        prefix: '/gaps',
        label: 'Find Gaps',
        description: 'Identify research gaps in the literature',
        icon: <Search size={16} />,
    },
    {
        id: 'cite',
        prefix: '/cite',
        label: 'Generate Citation',
        description: 'Generate a formatted citation',
        icon: <BookOpen size={16} />,
    },
    {
        id: 'factcheck',
        prefix: '/factcheck',
        label: 'Fact Check',
        description: 'Verify claims against sources',
        icon: <AlertTriangle size={16} />,
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
