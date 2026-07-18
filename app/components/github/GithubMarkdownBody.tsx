import MarkdownBody from '@/components/shared/MarkdownBody';

/** Markdown body with GitHub attachments loaded via IPC proxy (not raw https URLs). */
export default function GithubMarkdownBody({ content, className }: { content: string; className?: string }) {
  return (
    <MarkdownBody
      content={content}
      className={className}
      githubImageProxy
      surface
      compact
    />
  );
}
