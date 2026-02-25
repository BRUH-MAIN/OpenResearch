'use client';

import React from 'react';
import { Pin, X, Clock, MessageSquare } from 'lucide-react';

export interface PinnedNote {
    id: string;
    messageId: string;
    content: string;
    userName: string;
    pinnedAt: string;
}

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
    if (notes.length === 0) {
        return (
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
        );
    }

    return (
        <div className="space-y-2 p-3">
            {notes.map((note) => {
                // Show first 200 chars of content
                const preview =
                    note.content.length > 200
                        ? note.content.slice(0, 200) + '…'
                        : note.content;

                return (
                    <div key={note.id} className="pinned-note group">
                        {/* Header */}
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

                        {/* Content Preview */}
                        <p
                            className="text-[12px] leading-relaxed"
                            style={{ color: 'var(--color-text-tertiary)' }}
                        >
                            {preview}
                        </p>

                        {/* Timestamp */}
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
    );
}

export default WorkspacePinnedNotes;
