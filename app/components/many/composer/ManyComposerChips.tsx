import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  Mail01Icon,
  Share08Icon,
  Task01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { ResourceIconBox } from '@/components/shared/ResourceIcon';
import { inferResourceVisualKind, type ResourceVisualKind } from '@/lib/resources/resourceVisual';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { PinnedResource } from '@/lib/store/useManyStore';

interface ManyComposerChipsProps {
  attachments: ChatAttachment[];
  pinnedResources: PinnedResource[];
  onRemoveAttachment: (id: string) => void;
  onRemovePinned: (id: string) => void;
}

type AttachmentUiState = 'idle' | 'uploading' | 'processing' | 'error' | 'done';

function attachmentState(attachment: ChatAttachment): AttachmentUiState {
  if (attachment.kind === 'document') {
    if (attachment.status === 'loading') return 'processing';
    if (attachment.status === 'error') return 'error';
    return 'done';
  }
  if (attachment.kind === 'video' && attachment.status === 'uploading') return 'uploading';
  if (attachment.kind === 'video' && attachment.status === 'error') return 'error';
  return 'done';
}

function attachmentKind(attachment: ChatAttachment): ResourceVisualKind {
  if (attachment.kind === 'image') return 'image';
  if (attachment.kind === 'video') return 'video';
  return inferResourceVisualKind(undefined, attachment.name);
}

function attachmentDescription(
  attachment: ChatAttachment,
  pagesLabel: string | undefined,
): string | undefined {
  if (attachment.kind === 'document' && attachment.pageCount) return pagesLabel;
  if (attachment.kind === 'video' && attachment.sizeBytes) {
    const mb = attachment.sizeBytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(attachment.sizeBytes / 1024)} KB`;
  }
  return undefined;
}

/** Everything travelling with the next message: pinned resources + attached files. */
export default function ManyComposerChips({
  attachments,
  pinnedResources,
  onRemoveAttachment,
  onRemovePinned,
}: ManyComposerChipsProps) {
  const { t } = useTranslation();
  if (attachments.length === 0 && pinnedResources.length === 0) return null;

  return (
    <div className="min-w-0 w-full px-2.5 pt-2">
      <AttachmentGroup className="w-full max-w-full flex-wrap overflow-x-hidden *:data-[slot=attachment]:max-w-full">
        {pinnedResources.map((resource) => (
          <Attachment
            key={`pin-${resource.id}`}
            size="sm"
            state="done"
            className="max-w-full"
            title={resource.title}
          >
            <AttachmentMedia>
              {resource.kind === 'person' ? (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <HugeiconsIcon icon={UserIcon} size={14} />
                </span>
              ) : resource.kind === 'issue' ? (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <HugeiconsIcon icon={Task01Icon} size={14} />
                </span>
              ) : resource.kind === 'email' ? (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <HugeiconsIcon icon={Mail01Icon} size={14} />
                </span>
              ) : resource.kind === 'social_post' ? (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <HugeiconsIcon icon={Share08Icon} size={14} />
                </span>
              ) : (
                <ResourceIconBox
                  kind={inferResourceVisualKind(resource.type, resource.title)}
                  name={resource.title}
                />
              )}
            </AttachmentMedia>
            <AttachmentContent className="min-w-0 overflow-hidden">
              <AttachmentTitle>{resource.title}</AttachmentTitle>
              <AttachmentDescription>
                {resource.kind === 'person'
                  ? t('command.people')
                  : resource.kind === 'email'
                    ? t('email.tab_title')
                    : t('chat.group_pinned')}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={t('chat.remove_from_context')}
                onClick={() => onRemovePinned(resource.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
        {attachments.map((attachment) => (
          <Attachment
            key={attachment.id}
            size="sm"
            state={attachmentState(attachment)}
            className="max-w-full"
            title={attachment.name}
          >
            <AttachmentMedia variant={attachment.kind === 'image' ? 'image' : 'icon'}>
              {attachment.kind === 'image' ? (
                <img src={attachment.dataUrl} alt="" />
              ) : (
                <ResourceIconBox kind={attachmentKind(attachment)} name={attachment.name} />
              )}
            </AttachmentMedia>
            <AttachmentContent className="min-w-0 overflow-hidden">
              <AttachmentTitle>{attachment.name}</AttachmentTitle>
              {(() => {
                const description = attachmentDescription(
                  attachment,
                  attachment.kind === 'document' && attachment.pageCount
                    ? t('many.attachment_pages', { count: attachment.pageCount })
                    : undefined,
                );
                return description ? (
                  <AttachmentDescription>{description}</AttachmentDescription>
                ) : null;
              })()}
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={t('chat.remove_attachment')}
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
      </AttachmentGroup>
    </div>
  );
}
