'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { BookmarkPlus, ExternalLink, Copy, Link2 } from 'lucide-react';

/* ─── Context ─── */
export interface PaperContextMenuActions {
  onAddToSources?: (url: string, title: string) => void;
}

const PaperContextMenuContext = createContext<PaperContextMenuActions>({});

export function usePaperContextMenu() {
  return useContext(PaperContextMenuContext);
}

export function PaperContextMenuProvider({
  children,
  onAddToSources,
}: {
  children: React.ReactNode;
  onAddToSources?: (url: string, title: string) => void;
}) {
  return (
    <PaperContextMenuContext.Provider value={{ onAddToSources }}>
      {children}
    </PaperContextMenuContext.Provider>
  );
}

/* ─── Overlay context menu ─── */
interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  url: string;
  title: string;
}

export function PaperLinkContextMenu() {
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0, url: '', title: '' });
  const menuRef = useRef<HTMLDivElement>(null);
  const { onAddToSources } = usePaperContextMenu();

  // Listen for custom events dispatched by markdown link override
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setMenu({ visible: true, x: detail.x, y: detail.y, url: detail.url, title: detail.title });
    };
    document.addEventListener('paper-link-context', handler);
    return () => document.removeEventListener('paper-link-context', handler);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menu.visible) return;
    const close = () => setMenu((m) => ({ ...m, visible: false }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu.visible]);

  if (!menu.visible) return null;

  const items = [
    {
      icon: <BookmarkPlus size={14} />,
      label: 'Add to Sources',
      action: () => {
        onAddToSources?.(menu.url, menu.title);
        setMenu((m) => ({ ...m, visible: false }));
      },
      show: !!onAddToSources,
    },
    {
      icon: <ExternalLink size={14} />,
      label: 'Open in New Tab',
      action: () => {
        window.open(menu.url, '_blank', 'noopener');
        setMenu((m) => ({ ...m, visible: false }));
      },
      show: true,
    },
    {
      icon: <Copy size={14} />,
      label: 'Copy URL',
      action: () => {
        navigator.clipboard.writeText(menu.url);
        setMenu((m) => ({ ...m, visible: false }));
      },
      show: true,
    },
    {
      icon: <Link2 size={14} />,
      label: 'Copy as Citation',
      action: () => {
        navigator.clipboard.writeText(`[${menu.title}](${menu.url})`);
        setMenu((m) => ({ ...m, visible: false }));
      },
      show: true,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] py-1.5 rounded-lg shadow-xl border"
      style={{
        left: menu.x,
        top: menu.y,
        background: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border-primary)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items
        .filter((i) => i.show)
        .map((item, idx) => (
          <button
            key={idx}
            onClick={item.action}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[13px] transition-colors"
            style={{ color: 'var(--color-text-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
    </div>
  );
}
