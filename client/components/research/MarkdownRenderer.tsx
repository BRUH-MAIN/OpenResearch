'use client';

import React, { memo, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

import { CodeBlock, InlineCode } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

/* ─── Streaming cursor ─── */
function StreamingCursor() {
  return <span className="streaming-cursor" aria-hidden="true" />;
}

/* ─── Types ─── */
interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  onDiagramDetected?: (code: string) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ─── Component overrides ─── */
const markdownComponents: Record<string, React.ComponentType<any>> = {
  // ── Paragraphs ──
  p: ({ children, ...props }: any) => (
    <p className="text-[14px] leading-[1.75] mb-3 last:mb-0" {...props}>
      {children}
    </p>
  ),

  // ── Links ──
  a: ({ children, href, ...props }: any) => {
    // Detect IEEE citation links like [[1]](url)
    const childText = typeof children === 'string' ? children : '';
    const isCitationLink = /^\[\d+\]$/.test(childText);

    // Detect paper-like URLs for right-click context menu
    const isPaperUrl = href && /arxiv\.org|doi\.org|semanticscholar\.org|aclanthology\.org|openreview\.net|springer\.com|ieee\.org|acm\.org/i.test(href);

    const handleContextMenu = isPaperUrl
      ? (e: React.MouseEvent) => {
          e.preventDefault();
          const title = typeof children === 'string' ? children : href;
          document.dispatchEvent(
            new CustomEvent('paper-link-context', {
              detail: { x: e.clientX, y: e.clientY, url: href, title },
            })
          );
        }
      : undefined;

    if (isCitationLink) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onContextMenu={handleContextMenu}
          className="inline-flex items-center justify-center text-[11px] font-semibold rounded px-1 py-0.5 transition-colors hover:opacity-80 no-underline align-super"
          style={{
            color: 'var(--color-brand-secondary)',
            background: 'rgba(20, 255, 236, 0.1)',
            border: '1px solid rgba(20, 255, 236, 0.2)',
            lineHeight: 1,
            fontSize: '0.75em',
            verticalAlign: 'super',
          }}
          title={href}
          {...props}
        >
          {children}
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onContextMenu={handleContextMenu}
        className="underline decoration-1 underline-offset-2 transition-colors hover:opacity-80 break-all"
        style={{ color: 'var(--color-brand-secondary)' }}
        {...props}
      >
        {children}
      </a>
    );
  },

  // ── Code (inline + fenced) ──
  code: ({ children, className, ...props }: any) => {
    // react-markdown sets className="language-xxx" on fenced blocks
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    // If inside <pre> (fenced), check for mermaid first
    if (className) {
      if (lang === 'mermaid') {
        return <MermaidBlock code={codeString} />;
      }
      return <CodeBlock language={lang}>{codeString}</CodeBlock>;
    }

    // Inline code
    return <InlineCode>{children}</InlineCode>;
  },

  // ── Pre — just pass through; CodeBlock provides its own wrapper ──
  pre: ({ children }: any) => <>{children}</>,

  // ── Lists (with nested depth handling) ──
  ul: ({ children, depth, ...props }: any) => {
    const listStyle = depth && depth > 0 ? 'list-[circle]' : 'list-disc';
    const padding = depth && depth > 0 ? 'pl-4' : 'pl-5';
    return (
      <ul className={`${listStyle} ${padding} space-y-1.5 my-2`} {...props}>
        {children}
      </ul>
    );
  },
  ol: ({ children, depth, ...props }: any) => {
    const padding = depth && depth > 0 ? 'pl-4' : 'pl-5';
    return (
      <ol className={`list-decimal ${padding} space-y-1.5 my-2`} {...props}>
        {children}
      </ol>
    );
  },
  li: ({ children, ...props }: any) => (
    <li className="text-[14px] leading-[1.75] pl-1" {...props}>
      {children}
    </li>
  ),

  // ── Blockquotes ──
  blockquote: ({ children, ...props }: any) => (
    <blockquote
      className="pl-4 my-4 italic"
      style={{
        borderLeft: '3px solid var(--color-brand-primary)',
        color: 'var(--color-text-secondary)',
      }}
      {...props}
    >
      {children}
    </blockquote>
  ),

  // ── Headings ──
  h1: ({ children, ...props }: any) => (
    <h1
      className="text-[22px] font-semibold mt-6 mb-3 pb-2"
      style={{
        color: 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-primary)',
      }}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2
      className="text-[19px] font-semibold mt-5 mb-2 pb-1.5"
      style={{
        color: 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-primary)',
      }}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3
      className="text-[16px] font-semibold mt-4 mb-1.5"
      style={{ color: 'var(--color-text-primary)' }}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: any) => (
    <h4
      className="text-[15px] font-medium mt-3 mb-1"
      style={{ color: 'var(--color-text-primary)' }}
      {...props}
    >
      {children}
    </h4>
  ),

  // ── Horizontal rule ──
  hr: () => <hr className="divider my-5" />,

  // ── Tables (GFM) ──
  table: ({ children, ...props }: any) => (
    <div className="markdown-table-wrapper my-4 overflow-x-auto rounded-lg" style={{
      border: '1px solid var(--color-border-primary)',
    }}>
      <table className="markdown-table w-full text-[13px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead style={{ background: 'var(--color-bg-tertiary)' }} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: any) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: any) => (
    <tr
      className="markdown-table-row border-b transition-colors"
      style={{ borderColor: 'var(--color-border-primary)' }}
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }: any) => (
    <th
      className="px-4 py-2.5 text-left font-semibold text-[12px] uppercase tracking-wide"
      style={{ color: 'var(--color-text-secondary)' }}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td
      className="px-4 py-2.5"
      style={{ color: 'var(--color-text-secondary)' }}
      {...props}
    >
      {children}
    </td>
  ),

  // ── Images ──
  img: ({ src, alt, ...props }: any) => (
    <img
      src={src}
      alt={alt || ''}
      className="rounded-lg max-w-full my-4"
      loading="lazy"
      {...props}
    />
  ),

  // ── Strong / Em ──
  strong: ({ children, ...props }: any) => (
    <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }} {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic" style={{ color: 'var(--color-text-primary)', opacity: 0.85 }} {...props}>
      {children}
    </em>
  ),

  // ── Superscript / Subscript for footnotes ──
  sup: ({ children, ...props }: any) => (
    <sup className="text-[0.75em] align-super" style={{ color: 'var(--color-brand-secondary)' }} {...props}>
      {children}
    </sup>
  ),
  sub: ({ children, ...props }: any) => (
    <sub className="text-[0.75em] align-sub" {...props}>
      {children}
    </sub>
  ),
};

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex, rehypeRaw];

/* ─── Main renderer (memoized) ─── */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming = false,
  onDiagramDetected,
}: MarkdownRendererProps) {
  // Memoize plugins arrays so ReactMarkdown doesn't re-init on every render
  const remarkPluginsMemo = useMemo(() => remarkPlugins, []);
  const rehypePluginsMemo = useMemo(() => rehypePlugins, []);

  // Track which mermaid diagrams we've already reported
  const reportedDiagramsRef = useRef<Set<string>>(new Set());

  // Build components override that includes the diagram detection callback
  const components = useMemo(() => {
    if (!onDiagramDetected) return markdownComponents;
    return {
      ...markdownComponents,
      code: ({ children, className, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : '';
        const codeString = String(children).replace(/\n$/, '');

        if (className) {
          if (lang === 'mermaid') {
            // Report this diagram to the sidebar
            const key = codeString.slice(0, 200);
            if (!reportedDiagramsRef.current.has(key)) {
              reportedDiagramsRef.current.add(key);
              // Defer to avoid calling setState during render
              setTimeout(() => onDiagramDetected(codeString), 0);
            }
            return <MermaidBlock code={codeString} />;
          }
          return <CodeBlock language={lang}>{codeString}</CodeBlock>;
        }
        return <InlineCode>{children}</InlineCode>;
      },
    };
  }, [onDiagramDetected]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkPluginsMemo}
        rehypePlugins={rehypePluginsMemo}
        components={components}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  );
});

export default MarkdownRenderer;
