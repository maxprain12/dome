import { useTranslation } from 'react-i18next';
import { inferResourceVisualKind, resourceVisualCssSuffix } from '@/lib/resources/resourceVisual';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { PinnedResource } from '@/lib/store/useManyStore';
import { DomeResourceIconBox } from '@/components/ui/DomeResourceIcon';
import { X } from 'lucide-react';

interface ManyComposerAttachmentRowProps {
  attachments: ChatAttachment[];
  pinnedResources: PinnedResource[];
  onRemoveAttachment: (id: string) => void;
  onRemovePinned: (id: string) => void;
}

function AttachChip({
  kind,
  name,
  meta,
  isLoading,
  onRemove,
  removeLabel,
}: {
  kind: ReturnType<typeof inferResourceVisualKind>;
  name: string;
  meta?: string | null;
  isLoading?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  const tone = resourceVisualCssSuffix(kind);
  return (
    <span className={`attach-chip attach-chip--${tone}`}>
      <DomeResourceIconBox kind={kind} name={name} />
      <span className="attach-chip__name" title={name}>
        {name}
      </span>
      {meta ? <span className="attach-chip__meta">· {meta}</span> : null}
      {isLoading ? (
        <span className="attach-chip__spinner" aria-hidden />
      ) : (
        <button
          type="button"
          className="attach-chip__remove"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
        >
          <X size={11} strokeWidth={2} aria-hidden />
        </button>
      )}
    </span>
  );
}

/**
 * Context + file attachments inside the composer frame (prototype layout).
 */
export default function ManyComposerAttachmentRow({
  attachments,
  pinnedResources,
  onRemoveAttachment,
  onRemovePinned,
}: ManyComposerAttachmentRowProps) {
  const { t } = useTranslation();
  const total = attachments.length + pinnedResources.length;
  if (total === 0) return null;

  return (
    <div className="many-composer-attach-section" data-many-composer-attachments>
      <div className="many-composer-attach-head">
        <span className="many-composer-attach-label">{t('many.composer_context_label')}</span>
        <span className="many-composer-attach-count">{total}</span>
      </div>
      <div className="composer-attachments">
        {pinnedResources.map((resource) => {
          const kind = inferResourceVisualKind(resource.type, resource.title);
          return (
            <AttachChip
              key={`pin-${resource.id}`}
              kind={kind}
              name={resource.title}
              onRemove={() => onRemovePinned(resource.id)}
              removeLabel={t('chat.remove_from_context')}
            />
          );
        })}
        {attachments.map((attachment) => {
          const kind =
            attachment.kind === 'image'
              ? 'image'
              : inferResourceVisualKind(undefined, attachment.name);
          const meta =
            attachment.kind === 'document' && attachment.pageCount
              ? t('many.attachment_pages', { count: attachment.pageCount })
              : null;
          const isLoading = attachment.kind === 'document' && attachment.status === 'loading';

          return (
            <AttachChip
              key={attachment.id}
              kind={kind}
              name={attachment.name}
              meta={meta}
              isLoading={isLoading}
              onRemove={() => onRemoveAttachment(attachment.id)}
              removeLabel={t('chat.remove_attachment')}
            />
          );
        })}
      </div>
    </div>
  );
}
