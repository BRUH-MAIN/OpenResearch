'use client';

import React from 'react';
import {
    BookOpen,
    Sparkles,
    FileText,
    Clock,
    Plus,
} from 'lucide-react';

export interface TimelineEvent {
    id: string;
    type: 'source_added' | 'deep_research' | 'report_generated' | 'session_created';
    title: string;
    description?: string;
    timestamp: string;
}

interface WorkspaceTimelineProps {
    events: TimelineEvent[];
}

export function WorkspaceTimeline({ events }: WorkspaceTimelineProps) {
    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: 'var(--color-bg-tertiary)' }}
                >
                    <Clock size={22} style={{ color: 'var(--color-text-muted)' }} />
                </div>
                <p
                    className="text-[13px] font-medium mb-1"
                    style={{ color: 'var(--color-text-secondary)' }}
                >
                    No activity yet
                </p>
                <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: 'var(--color-text-muted)' }}
                >
                    Your research timeline will appear here as you add sources and run analyses.
                </p>
            </div>
        );
    }

    const getEventIcon = (type: TimelineEvent['type']) => {
        switch (type) {
            case 'source_added':
                return <Plus size={10} style={{ color: 'var(--color-success)' }} />;
            case 'deep_research':
                return <Sparkles size={10} style={{ color: 'var(--color-brand-secondary)' }} />;
            case 'report_generated':
                return <FileText size={10} style={{ color: 'var(--color-info)' }} />;
            case 'session_created':
                return <BookOpen size={10} style={{ color: 'var(--color-text-tertiary)' }} />;
        }
    };

    const getEventColor = (type: TimelineEvent['type']) => {
        switch (type) {
            case 'source_added':
                return 'var(--color-success)';
            case 'deep_research':
                return 'var(--color-brand-secondary)';
            case 'report_generated':
                return 'var(--color-info)';
            case 'session_created':
                return 'var(--color-text-tertiary)';
        }
    };

    const formatTime = (ts: string) => {
        const date = new Date(ts);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);

        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="p-3 relative">
            <div className="timeline-line" />
            <div className="space-y-0">
                {events.map((event) => (
                    <div key={event.id} className="timeline-item">
                        <div
                            className="timeline-dot flex items-center justify-center"
                            style={{ borderColor: getEventColor(event.type) }}
                        >
                            {getEventIcon(event.type)}
                        </div>
                        <p
                            className="text-[12px] font-medium leading-snug"
                            style={{ color: 'var(--color-text-primary)' }}
                        >
                            {event.title}
                        </p>
                        {event.description && (
                            <p
                                className="text-[11px] mt-0.5"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                {event.description}
                            </p>
                        )}
                        <p
                            className="text-[10px] mt-1"
                            style={{ color: 'var(--color-text-muted)' }}
                        >
                            {formatTime(event.timestamp)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default WorkspaceTimeline;
