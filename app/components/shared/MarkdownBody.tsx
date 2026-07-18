import { useMemo } from 'react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { normalizeGithubHtmlImages } from '@/lib/github/client';
import { cn } from '@/lib/utils';

export type MarkdownBodyProps = {
  content: string;
  className?: string;
  /** Load github.com / githubusercontent.com images via main-process proxy. */
  githubImageProxy?: boolean;
  /**
   * Soft panel (border + muted fill) around the body. Prefer for detail
   * modals and description fields so markdown is visually separated.
   */
  surface?: boolean;
  /** Denser typeset scale for modals / side panels (default true). */
  compact?: boolean;
};

/**
 * Canonical place to render markdown outside chat bubbles.
 *
 * Always uses `typeset` / `typeset-docs` via MarkdownRenderer, with a compact
 * scale and optional surface so headings, lists, code and GFM tables read
 * clearly in calendar / GitHub / pipeline detail views.
 *
 * @see `.claude/sops/markdown-surfaces.md`
 */
export function MarkdownBody({
  content,
  className,
  githubImageProxy = false,
  surface = true,
  compact = true,
}: MarkdownBodyProps) {
  const source = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return '';
    return githubImageProxy ? normalizeGithubHtmlImages(trimmed) : trimmed;
  }, [content, githubImageProxy]);

  if (!source) return null;

  return (
    <div
      className={cn(
        'markdown-body min-w-0 overflow-x-hidden',
        surface && 'rounded-lg border border-border/80 bg-muted/25',
        className,
      )}
    >
      <MarkdownRenderer
        content={source}
        githubImageProxy={githubImageProxy}
        className={cn(
          'max-w-none px-3.5 py-3',
          compact && 'typeset-compact',
        )}
      />
    </div>
  );
}

export default MarkdownBody;
