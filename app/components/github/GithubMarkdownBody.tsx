import { useMemo } from 'react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { normalizeGithubHtmlImages } from '@/lib/github/client';

/** Markdown body with GitHub attachments loaded via IPC proxy (not raw https URLs). */
export default function GithubMarkdownBody({ content, className }: { content: string; className?: string }) {
  const normalized = useMemo(() => normalizeGithubHtmlImages(content), [content]);

  return (
    <div className={className}>
      <MarkdownRenderer content={normalized} githubImageProxy />
    </div>
  );
}
