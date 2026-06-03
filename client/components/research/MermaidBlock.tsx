'use client';

import React, { useEffect, useRef, useState, useId } from 'react';

interface MermaidBlockProps {
  code: string;
}

/**
 * Renders a Mermaid diagram from source code.
 * Lazy-loads mermaid only when this component mounts — keeps
 * it out of the main bundle (≈800 KB).
 */
export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = `mermaid-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#0d7377',
            primaryTextColor: '#e8eaed',
            primaryBorderColor: '#14ffec',
            lineColor: '#5f6368',
            secondaryColor: '#1e2a3a',
            tertiaryColor: '#28292a',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
          securityLevel: 'loose',
        });

        const { svg: rendered } = await mermaid.render(uniqueId, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvg(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, uniqueId]);

  if (error) {
    return (
      <div className="my-4 rounded-xl overflow-hidden" style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-primary)',
      }}>
        <div className="px-4 py-2 text-[12px] font-medium" style={{
          color: 'var(--color-text-muted)',
          borderBottom: '1px solid var(--color-border-primary)',
          background: 'var(--color-bg-tertiary)',
        }}>
          Mermaid Diagram
        </div>
        <div className="p-4">
          <p className="text-[13px] mb-2" style={{ color: 'var(--color-error)' }}>
            Diagram rendering failed
          </p>
          <pre className="text-[12px] overflow-x-auto p-3 rounded-lg font-mono" style={{
            background: 'var(--color-bg-primary)',
            color: 'var(--color-text-muted)',
          }}>
            {code}
          </pre>
        </div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 rounded-xl overflow-hidden animate-pulse" style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-primary)',
        minHeight: 120,
      }}>
        <div className="flex items-center justify-center h-[120px] gap-2">
          <div className="w-4 h-4 rounded-full animate-spin" style={{
            border: '2px solid var(--color-border-primary)',
            borderTop: '2px solid var(--color-brand-secondary)',
          }} />
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Rendering diagram…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden" style={{
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border-primary)',
    }}>
      <div className="px-4 py-2 text-[12px] font-medium" style={{
        color: 'var(--color-text-muted)',
        borderBottom: '1px solid var(--color-border-primary)',
        background: 'var(--color-bg-tertiary)',
      }}>
        Mermaid Diagram
      </div>
      <div
        ref={containerRef}
        className="p-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export default MermaidBlock;
