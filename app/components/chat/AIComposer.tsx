import type {
  DragEventHandler,
  FormEventHandler,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { attachmentVisualKind, type ChatAttachment } from '@/lib/chat/attachmentTypes';
import { resourceVisualCssSuffix } from '@/lib/resources/resourceVisual';
import type { PinnedResource } from '@/lib/store/useManyStore';
import ResourceIcon, { ResourceIconBox } from '@/components/shared/ResourceIcon';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AIComposerFrameProps {
  children: ReactNode;
  containerRef: Ref<HTMLDivElement>;
  isDragging?: boolean;
  isWelcomeScreen?: boolean;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}

export function AIComposerFrame({
  children,
  containerRef,
  isDragging = false,
  isWelcomeScreen = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: AIComposerFrameProps) {
  return (
    <div
      ref={containerRef}
      className={cn(
        'ai-composer-frame relative flex flex-col overflow-hidden border shadow-sm transition-colors',
        'focus-within:border-ring focus-within:shadow-[0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent)]',
        isDragging && 'ai-composer-frame-dragging border-primary',
        isWelcomeScreen && 'ai-composer-frame-welcome shadow-lg',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}

interface AIComposerAttachmentTrayProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  /** Many redesign: chips inside composer (prototype attach-chip). */
  variant?: 'default' | 'many';
}

export function AIComposerAttachmentTray({
  attachments,
  onRemove,
  variant = 'default',
}: AIComposerAttachmentTrayProps) {
  const { t } = useTranslation();
  if (attachments.length === 0) return null;

  if (variant === 'many') {
    return (
      <div className="composer-attachments">
        {attachments.map((attachment) => {
          const kind =
            attachment.kind === 'image'
              ? 'image'
              : attachmentVisualKind(attachment.name);
          const tone = resourceVisualCssSuffix(kind);
          const isLoading = attachment.kind === 'document' && attachment.status === 'loading';
          const meta =
            attachment.kind === 'document' && attachment.pageCount
              ? t('many.attachment_pages', { count: attachment.pageCount })
              : null;

          return (
            <span key={attachment.id} className={`attach-chip attach-chip--${tone}`}>
              {attachment.kind === 'image' ? (
                <span className="attach-icon attach-icon--thumb">
                  <img src={attachment.dataUrl} alt="" />
                </span>
              ) : (
                <ResourceIconBox kind={kind} name={attachment.name} />
              )}
              <span className="attach-chip__name">{attachment.name}</span>
              {meta ? <span className="attach-chip__meta">· {meta}</span> : null}
              {isLoading ? (
                <span className="attach-chip__spinner" aria-hidden />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="attach-chip__remove"
                  onClick={() => onRemove(attachment.id)}
                  aria-label={t('chat.remove_attachment')}
                  title={t('chat.remove_attachment')}
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </Button>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-dashed border-border px-3 pt-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {attachment.kind === 'image' ? (
            <img src={attachment.dataUrl} alt="" className="size-6 shrink-0 rounded object-cover" />
          ) : (
            <ResourceIcon name={attachment.name} size={14} className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(attachment.id)}
            aria-label={t('chat.remove_attachment')}
            title={t('chat.remove_attachment')}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
      ))}
    </div>
  );
}

interface AIComposerPinnedResourceChipProps {
  resource: PinnedResource;
  onRemove: (id: string) => void;
}

export function AIComposerPinnedResourceChip({ resource, onRemove }: AIComposerPinnedResourceChipProps) {
  const { t } = useTranslation();

  return (
    <div className="ai-context-chip">
      <ResourceIcon type={resource.type} name={resource.title} size={11} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{resource.title}</span>
      <Button
        type="button"
        onClick={() => onRemove(resource.id)}
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title={t('chat.remove_from_context')}
        aria-label={t('chat.remove_from_context')}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  );
}

interface AIComposerIconButtonProps {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  title: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
  className?: string;
  ariaHaspopup?: 'menu';
  ariaExpanded?: boolean;
}

export function AIComposerIconButton({
  children,
  active = false,
  disabled = false,
  title,
  ariaLabel,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  type = 'button',
  className,
  ariaHaspopup,
  ariaExpanded,
}: AIComposerIconButtonProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      disabled={disabled}
      variant="ghost"
      size="icon"
      className={cn(
        'shrink-0 rounded-full transition-[color,background-color,border-color,box-shadow,opacity,transform]',
        active
          ? 'bg-[color-mix(in srgb, var(--primary) 12%, transparent)] text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-muted-foreground',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
    >
      {children}
    </Button>
  );
}

export const AI_COMPOSER_TEXTAREA_CLASS =
  'w-full resize-none border-none bg-transparent px-4 pt-4 pb-2 text-[14px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-50';

export const AI_COMPOSER_INPUT_HANDLER: FormEventHandler<HTMLTextAreaElement> = (event) => {
  const target = event.target as HTMLTextAreaElement;
  target.style.height = 'auto';
  target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
};
