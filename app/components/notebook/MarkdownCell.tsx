'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useTextareaAutoResize } from '@/lib/hooks/useTextareaAutoResize';

interface MarkdownCellProps {
  source: string | string[];
  onChange?: (source: string) => void;
  editable?: boolean;
}

function sourceToString(source: string | string[]): string {
  return typeof source === 'string' ? source : source.join('');
}

const proseComponents: Components = {
  pre: ({ children, className, ...props }) => (
    <div className="overflow-x-auto max-w-full my-2">
      <pre className={`min-w-0 ${className ?? ''}`.trim()} {...props}>
        {children}
      </pre>
    </div>
  ),
  code: ({ className, children }) => (
    <code className={className ? `${className} break-words` : 'break-words'}>
      {children}
    </code>
  ),
};

export default function MarkdownCell({ source, onChange, editable = false }: MarkdownCellProps) {
  const content = sourceToString(source);
  const textareaRef = useTextareaAutoResize(content);

  if (editable && onChange) {
    return (
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[60px] p-4 rounded-lg font-mono text-sm min-w-0 border border-[var(--border)] transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 placeholder:text-[var(--tertiary-text)]"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--primary-text)',
          fieldSizing: 'content',
        } as React.CSSProperties}
        placeholder="Escribe markdown aquí..."
      />
    );
  }

  return (
    <div
      className="markdown-cell prose prose-sm max-w-none break-words p-4 rounded-lg shadow-sm [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-words"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        color: 'var(--primary-text)',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={proseComponents}>
        {content || '_Vacío_'}
      </ReactMarkdown>
    </div>
  );
}
