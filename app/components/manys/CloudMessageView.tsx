import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, Copy01Icon } from '@hugeicons/core-free-icons';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { MessageFooter } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { ManyActivityBlocks } from '@/components/many/conversation/ManyActivityTrace';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { activityTraceCopyFromT } from '@/lib/chat/manyActivityTrace';
import { coalesceDuplicateToolCalls } from '@/lib/chat/coalesceToolCalls';
import { interleaveMessageParts } from '@/lib/chat/interleaveMessageParts';
import { typesetDocsClass } from '@/lib/typeset';
import type { ManyMessageRenderProps } from '@/lib/many/types';
import { cn } from '@/lib/utils';
import { useManysHost } from './ManysHost';

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(getDateTimeLocaleTag(), { hour: '2-digit', minute: '2-digit' });
}

/** The prose of a cloud Many: Markdown with tables and task lists, links that open where the host says. */
function CloudMarkdown({ content, onOpenLink }: { content: string; onOpenLink?: (href: string) => void }) {
  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => (
      <a
        href={href}
        target={onOpenLink ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={onOpenLink && href ? (event) => { event.preventDefault(); onOpenLink(href); } : undefined}
      >
        {children}
      </a>
    ),
  }), [onOpenLink]);
  return (
    <div className={typesetDocsClass('min-w-0 w-full')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}

function UserTurn({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <div className={cn('flex min-w-0 flex-col items-end gap-1.5', className)}>
      <Bubble variant="secondary" align="end" className="max-w-[88%]">
        <BubbleContent>
          <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</span>
        </BubbleContent>
      </Bubble>
    </div>
  );
}

/**
 * One message of a cloud Many, drawn with pure components only: Markdown prose and the tool trace.
 * It reads nothing from the desktop (no stores, no IPC, no toasts), so the same view runs in the
 * desktop app and in a browser. What only a host can do (open a link) arrives through `ManysHost`.
 */
export default function CloudMessageView({ message, isLastInGroup }: ManyMessageRenderProps) {
  const { t } = useTranslation();
  const { openLink } = useManysHost();
  const [copied, setCopied] = useState(false);
  const traceCopy = useMemo(() => activityTraceCopyFromT((key, opts) => t(`chat.${key}`, opts)), [t]);
  const parts = useMemo(
    () => interleaveMessageParts(message.content ?? '', coalesceDuplicateToolCalls(message.toolCalls ?? []), t),
    [message.content, message.toolCalls, t],
  );
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the clipboard is not available here */
    }
  }, [message.content]);

  if (message.role === 'user') return <UserTurn content={message.content} />;

  const waiting = Boolean(message.isStreaming && !message.content && isLastInGroup);
  const showFooter = !message.isStreaming && isLastInGroup && Boolean(message.content);
  return (
    <div className="group/turn flex min-w-0 w-full flex-col gap-2">
      {waiting ? (
        <Marker role="status">
          <MarkerIcon><Spinner /></MarkerIcon>
          <MarkerContent className="shimmer">{message.streamingLabel || t('chat.processing')}</MarkerContent>
        </Marker>
      ) : null}
      {parts.map((part, index) => (part.type === 'tools' ? (
        <ManyActivityBlocks
          key={`tools:${index}:${part.blocks.map((block) => (block.type === 'tool' ? block.call.id : block.type)).join(',')}`}
          blocks={part.blocks}
          copy={traceCopy}
          toolLabelT={t}
          onOpenUrl={openLink}
        />
      ) : (
        <CloudMarkdown key={`text:${index}`} content={part.text} onOpenLink={openLink} />
      )))}
      {showFooter ? (
        <MessageFooter className="gap-0.5 opacity-0 transition-opacity group-hover/turn:opacity-100 group-focus-within/turn:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none">
          <Button type="button" size="icon-xs" variant="ghost" onClick={() => { void handleCopy(); }} title={t('chat.copy_message')}>
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
          </Button>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatMessageTime(message.timestamp)}</span>
        </MessageFooter>
      ) : null}
    </div>
  );
}
