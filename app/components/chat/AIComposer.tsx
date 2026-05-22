import type {
  CSSProperties,
  DragEventHandler,
  FormEventHandler,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { attachmentVisualKind, type ChatAttachment } from '@/lib/chat/attachmentTypes';
import { resourceVisualCssSuffix } from '@/lib/resources/resourceVisual';
import type { PinnedResource } from '@/lib/store/useManyStore';
import DomeResourceIcon, { DomeResourceIconBox } from '@/components/ui/DomeResourceIcon';
import { cn } from '@/lib/utils';

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
        'ai-composer-frame relative flex flex-col overflow-hidden border transition-colors',
        'focus-within:border-[var(--border-hover)] focus-within:shadow-[var(--focus-ring)]',
        isDragging && 'ai-composer-frame-dragging',
        isWelcomeScreen && 'ai-composer-frame-welcome',
      )}
      style={{
        borderColor: isDragging ? 'var(--accent)' : 'var(--border)',
        boxShadow: isWelcomeScreen ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      }}
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
                <DomeResourceIconBox kind={kind} name={attachment.name} />
              )}
              <span className="attach-chip__name">{attachment.name}</span>
              {meta ? <span className="attach-chip__meta">· {meta}</span> : null}
              {isLoading ? (
                <span className="attach-chip__spinner" aria-hidden />
              ) : (
                <button
                  type="button"
                  className="attach-chip__remove"
                  onClick={() => onRemove(attachment.id)}
                  aria-label={t('chat.remove_attachment')}
                  title={t('chat.remove_attachment')}
                >
                  <X size={11} strokeWidth={2} aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-dashed border-[var(--border)] px-3 pt-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--secondary-text)]"
        >
          {attachment.kind === 'image' ? (
            <img src={attachment.dataUrl} alt="" className="size-6 shrink-0 rounded object-cover" />
          ) : (
            <DomeResourceIcon name={attachment.name} size={14} className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-[var(--tertiary-text)] transition-colors hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            onClick={() => onRemove(attachment.id)}
            aria-label={t('chat.remove_attachment')}
            title={t('chat.remove_attachment')}
          >
            <X className="size-3.5" aria-hidden />
          </button>
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
      <DomeResourceIcon type={resource.type} name={resource.title} size={11} className="shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1 truncate">{resource.title}</span>
      <button
        type="button"
        onClick={() => onRemove(resource.id)}
        className="flex shrink-0 items-center rounded-sm p-0 text-[var(--tertiary-text)] transition-colors hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        title={t('chat.remove_from_context')}
        aria-label={t('chat.remove_from_context')}
      >
        <X className="h-[11px] w-[11px]" aria-hidden />
      </button>
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
  style?: CSSProperties;
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
  style,
  ariaHaspopup,
  ariaExpanded,
}: AIComposerIconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      disabled={disabled}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        active
          ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
          : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      style={style}
    >
      {children}
    </button>
  );
}

export const AI_COMPOSER_TEXTAREA_CLASS =
  'w-full resize-none border-none bg-transparent px-4 pt-4 pb-2 text-[14px] leading-[1.6] text-[var(--primary-text)] placeholder:text-[var(--tertiary-text)] focus:outline-none focus:ring-0 disabled:opacity-50';

export const AI_COMPOSER_INPUT_HANDLER: FormEventHandler<HTMLTextAreaElement> = (event) => {
  const target = event.target as HTMLTextAreaElement;
  target.style.height = 'auto';
  target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
};
