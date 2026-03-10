'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Copy, Check } from 'lucide-react';

// Lazy-loaded Shiki highlighter — singleton promise so we only init once
let highlighterPromise: Promise<import('shiki').Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((mod) =>
      mod.createHighlighter({
        themes: ['github-dark-default'],
        langs: [
          'javascript',
          'typescript',
          'python',
          'bash',
          'json',
          'html',
          'css',
          'sql',
          'markdown',
          'yaml',
          'jsx',
          'tsx',
          'rust',
          'go',
          'java',
          'cpp',
          'c',
          'shell',
          'plaintext',
        ],
      })
    );
  }
  return highlighterPromise;
}

// Display-friendly language labels
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  md: 'Markdown',
  markdown: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  rust: 'Rust',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  plaintext: 'Text',
  text: 'Text',
  '': 'Code',
};

interface CodeBlockProps {
  children: string;
  language?: string;
  inline?: boolean;
}

/* ─── Inline code ─── */
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded text-[13px] font-mono"
      style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-primary)',
        color: 'var(--color-brand-secondary)',
      }}
    >
      {children}
    </code>
  );
}

/* ─── Fenced code block ─── */
export function CodeBlock({ children, language = '' }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = language.toLowerCase().replace(/^language-/, '');
  const label = LANGUAGE_LABELS[lang] ?? (lang.toUpperCase() || 'Code');

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        // Try the requested lang, fall back to plaintext if not loaded
        let effectiveLang = lang || 'plaintext';
        try {
          highlighter.codeToHtml('', { lang: effectiveLang, theme: 'github-dark-default' });
        } catch {
          effectiveLang = 'plaintext';
        }
        const result = highlighter.codeToHtml(codeString, {
          lang: effectiveLang,
          theme: 'github-dark-default',
        });
        setHtml(result);
      })
      .catch(() => {
        /* Shiki failed — fall back to plain rendering */
      });
    return () => {
      cancelled = true;
    };
  }, [codeString, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [codeString]);

  return (
    <div className="code-block-container my-4 rounded-xl overflow-hidden" style={{
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border-primary)',
    }}>
      {/* Header */}
      <div className="code-block-header flex items-center justify-between px-4 py-2" style={{
        background: 'var(--color-bg-tertiary)',
        borderBottom: '1px solid var(--color-border-primary)',
      }}>
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-all"
          style={{
            color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      {/* Code body */}
      {html ? (
        <div
          className="code-block-body overflow-x-auto p-4 text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono" style={{
          color: 'var(--color-text-secondary)',
          background: 'transparent',
        }}>
          <code>{codeString}</code>
        </pre>
      )}
    </div>
  );
}

export default CodeBlock;
