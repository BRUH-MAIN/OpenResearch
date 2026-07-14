'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'dark',
    toggleTheme: () => { },
});

const STORAGE_KEY = 'or-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    // The app's own styles key off [data-theme]; shadcn/Radix components key off
    // the `.dark` class. Set both, so there is one source of truth for the theme.
    const applyTheme = (next: Theme) => {
        const root = document.documentElement;
        root.setAttribute('data-theme', next);
        root.classList.toggle('dark', next === 'dark');
    };

    // Read persisted theme on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
            if (stored === 'light' || stored === 'dark') {
                // The persisted theme can only be read once the client has
                // hydrated; reading it during render would produce markup that
                // differs from the server's.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setTheme(stored);
                applyTheme(stored);
            }
        } catch {
            // localStorage unavailable
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    // Sync whenever the theme changes
    useEffect(() => {
        if (!mounted) return;
        applyTheme(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // localStorage unavailable
        }
    }, [theme, mounted]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
