'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Pin, X, Clock, MessageSquare, NotebookPen } from 'lucide-react';

export interface PinnedNote {
    id: string;
    messageId: string;
    content: string;
    userName: string;
    pinnedAt: string;
}

type NotesSubTab = 'pinned' | 'scratchpad';

const SCRATCHPAD_KEY = 'openresearch_scratchpad';

interface WorkspacePinnedNotesProps {
    notes: PinnedNote[];
    onRemoveNote: (noteId: string) => void;
    onScrollToMessage: (messageId: string) => void;
}

export function WorkspacePinnedNotes({
    notes,
    onRemoveNote,
    onScrollToMessage,
}: WorkspacePinnedNotesProps) {
    const [subTab, setSubTab] = useState<NotesSubTab>('pinned');
    const [scratchpad, setScratchpad] = useState('');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load scratchpad from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SCRATCHPAD_KEY);
            // Reading localStorage must happen after hydration: doing it during
            // render would produce markup that differs from the server's, which is
            // a worse problem than the extra render pass this costs.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (saved) setScratchpad(saved);
        } catch { /* ignore */ }
    }, []);

    // Auto-save scratchpad with debounce
    const handleScratchpadChange = (value: string) => {
        setScratchpad(value);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            try { localStorage.setItem(SCRATCHPAD_KEY, value); } catch { /* ignore */ }
        }, 400);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Sub-tabs */}
            <div className="flex border-b px-3 pt-2" style={{ borderColor: 'var(--color-border-primary)' }}>
                <button
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-t transition-colors"
                    style={{
                        color: subTab === 'pinned' ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                        borderBottom: subTab === 'pinned' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
                    }}
                    onClick={() => setSubTab('pinned')}
                >
                    <Pin size={11} /> Pinned {notes.length > 0 && `(${notes.length})`}
                </button>
                <button
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-t transition-colors"
                    style={{
                        color: subTab === 'scratchpad' ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                        borderBottom: subTab === 'scratchpad' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
                    }}
                    onClick={() => setSubTab('scratchpad')}
                >
                    <NotebookPen size={11} /> Scratchpad
                </button>
            </div>

            {subTab === 'scratchpad' && (
                <div className="flex-1 flex flex-col p-3">
                    <textarea
                        value={scratchpad}
                        onChange={(e) => handleScratchpadChange(e.target.value)}
                        placeholder="Jot down ideas, research notes, or observations…"
                        className="flex-1 w-full resize-none rounded-lg p-3 text-[13px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-primary)]"
                        style={{
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border-primary)',
                            minHeight: '200px',
                        }}
                    />
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        Auto-saved locally
                    </p>
                </div>
            )}

            {subTab === 'pinned' && (
                notes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                            style={{ background: 'var(--color-bg-tertiary)' }}
                        >
                            <Pin size={22} style={{ color: 'var(--color-text-muted)' }} />
                        </div>
                        <p
                            className="text-[13px] font-medium mb-1"
                            style={{ color: 'var(--color-text-secondary)' }}
                        >
                            No pinned notes
                        </p>
                        <p
                            className="text-[12px] leading-relaxed"
                            style={{ color: 'var(--color-text-muted)' }}
                        >
                            Pin AI responses from the chat to save key insights here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 p-3">
                        {notes.map((note) => {
                            const preview =
                                note.content.length > 200
                                    ? note.content.slice(0, 200) + '…'
                                    : note.content;

                            return (
                                <div key={note.id} className="pinned-note group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <MessageSquare
                                                size={12}
                                                style={{ color: 'var(--color-brand-secondary)' }}
                                            />
                                            <span
                                                className="text-[11px] font-medium"
                                                style={{ color: 'var(--color-text-secondary)' }}
                                            >
                                                {note.userName}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => onScrollToMessage(note.messageId)}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ color: 'var(--color-text-tertiary)' }}
                                                title="Go to message"
                                            >
                                                <Clock size={12} />
                                            </button>
                                            <button
                                                onClick={() => onRemoveNote(note.id)}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ color: 'var(--color-text-tertiary)' }}
                                                title="Unpin"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <p
                                        className="text-[12px] leading-relaxed"
                                        style={{ color: 'var(--color-text-tertiary)' }}
                                    >
                                        {preview}
                                    </p>
                                    <p
                                        className="text-[10px] mt-2"
                                        style={{ color: 'var(--color-text-muted)' }}
                                    >
                                        Pinned {new Date(note.pinnedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
}

export default WorkspacePinnedNotes;
