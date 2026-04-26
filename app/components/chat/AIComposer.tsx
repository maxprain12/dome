import type {
  CSSProperties,
  DragEventHandler,
  FormEventHandler,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { PinnedResource } from '@/lib/store/useManyStore';
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
}

export function AIComposerAttachmentTray({ attachments, onRemove }: AIComposerAttachmentTrayProps) {
  const { t } = useTranslation();
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-dashed border-[var(--border)] px-3 pt-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--secondary-text)]"
        >
          {attachment.kind === 'image' ? (
            <img src={attachment.dataUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-[var(--tertiary-text)] transition-colors hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            onClick={() => onRemove(attachment.id)}
            aria-label={t('chat.remove_attachment')}
            title={t('chat.remove_attachment')}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
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
      <FileText className="h-[11px] w-[11px] shrink-0 text-[var(--accent)]" aria-hidden />
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
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all',
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
