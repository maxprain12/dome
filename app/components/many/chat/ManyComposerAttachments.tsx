import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
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
import { Separator } from '@/components/ui/separator';
import { ResourceIconBox } from '@/components/shared/ResourceIcon';
import type { ChatAttachment } from '@/lib/chat/attachmentTypes';
import type { PinnedResource } from '@/lib/store/useManyStore';
import {
  composerAttachmentKind,
  composerAttachmentState,
  formatAttachmentDescription,
  pinnedResourceKind,
} from './attachmentModel';

interface ManyComposerAttachmentsProps {
  attachments: ChatAttachment[];
  pinnedResources: PinnedResource[];
  onRemoveAttachment: (id: string) => void;
  onRemovePinned: (id: string) => void;
  contextExtras?: ReactNode;
}

export default function ManyComposerAttachments({
  attachments,
  pinnedResources,
  onRemoveAttachment,
  onRemovePinned,
  contextExtras,
}: ManyComposerAttachmentsProps) {
  const { t } = useTranslation();
  const count = attachments.length + pinnedResources.length;
  if (count === 0 && !contextExtras) return null;

  return (
    <>
      <Separator />
      <div className="px-2.5 py-1.5">
        <AttachmentGroup>
        {contextExtras}
        {pinnedResources.map((resource) => {
          const kind = pinnedResourceKind(resource.type, resource.title);
          return (
            <Attachment key={`pin-${resource.id}`} size="sm" state="done">
              <AttachmentMedia>
                <ResourceIconBox kind={kind} name={resource.title} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{resource.title}</AttachmentTitle>
                <AttachmentDescription>{t('chat.group_pinned')}</AttachmentDescription>
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
          );
        })}
        {attachments.map((attachment) => {
          const kind = composerAttachmentKind(attachment);
          const state = composerAttachmentState(attachment);
          const description = formatAttachmentDescription(
            attachment,
            attachment.kind === 'document' && attachment.pageCount
              ? t('many.attachment_pages', { count: attachment.pageCount })
              : undefined,
          );

          return (
            <Attachment key={attachment.id} size="sm" state={state}>
              <AttachmentMedia variant={attachment.kind === 'image' ? 'image' : 'icon'}>
                {attachment.kind === 'image' ? (
                  <img src={attachment.dataUrl} alt="" />
                ) : (
                  <ResourceIconBox kind={kind} name={attachment.name} />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{attachment.name}</AttachmentTitle>
                {description ? <AttachmentDescription>{description}</AttachmentDescription> : null}
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
          );
        })}
      </AttachmentGroup>
      </div>
    </>
  );
}
