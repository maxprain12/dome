'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useTextareaAutoResize } from '@/lib/hooks/useTextareaAutoResize';
import { useTranslation } from 'react-i18next';
import { typesetDocsClass } from '@/lib/typeset';

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
    <div className="not-typeset overflow-x-auto max-w-full">
      <pre className={`min-w-0 ${className ?? ''}`.trim()} {...props}>
        {children}
      </pre>
    </div>
  ),
};

export default function MarkdownCell({ source, onChange, editable = false }: MarkdownCellProps) {
  const { t } = useTranslation();
  const content = sourceToString(source);
  const textareaRef = useTextareaAutoResize(content);

  if (editable && onChange) {
    return (
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[60px] p-4 rounded-lg font-mono text-sm min-w-0 border border-border transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 placeholder:text-muted-foreground"
        style={{
          background: 'var(--card)',
          color: 'var(--foreground)',
          fieldSizing: 'content',
        } as React.CSSProperties}
        placeholder={t('notebook.markdown_placeholder')}
        aria-label={t('notebook.markdown_placeholder')}
      />
    );
  }

  return (
    <div
      className={typesetDocsClass('markdown-cell break-words rounded-lg border border-border bg-secondary p-4 shadow-sm')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={proseComponents}>
        {content || '_Vacío_'}
      </ReactMarkdown>
    </div>
  );
}
