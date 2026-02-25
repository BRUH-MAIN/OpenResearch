import { useEffect, useCallback, useRef } from 'react';

interface Shortcut {
    /** Keyboard key (e.g. 'k', 'Enter', 'Escape') */
    key: string;
    /** Require Ctrl (Cmd on Mac) */
    ctrl?: boolean;
    /** Require Shift */
    shift?: boolean;
    /** Handler function */
    handler: (e: KeyboardEvent) => void;
    /** If true, shortcut fires even when an input/textarea is focused */
    allowInInput?: boolean;
}

/**
 * Register global keyboard shortcuts.
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 'k', ctrl: true, handler: () => openSearch() },
 *   { key: 'Escape', handler: () => closePanel() },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
    // Keep shortcuts ref-stable so effect doesn't re-subscribe
    const shortcutsRef = useRef(shortcuts);
    shortcutsRef.current = shortcuts;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isInput =
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable;

        for (const shortcut of shortcutsRef.current) {
            const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
            const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : true;
            const shiftMatch = shortcut.shift ? e.shiftKey : true;

            if (keyMatch && ctrlMatch && shiftMatch) {
                if (isInput && !shortcut.allowInInput) continue;
                e.preventDefault();
                shortcut.handler(e);
                return;
            }
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
