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
import { inferResourceVisualKind } from '@/lib/resources/resourceVisual';
import type { PinnedResource } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

export type PinnedResourceChip = Pick<PinnedResource, 'id' | 'title' | 'type' | 'kind'>;

export interface PinnedResourceChipListProps {
  resources: PinnedResourceChip[];
  /** When set, chips are removable (composer). Omit for transcript (read-only). */
  onRemove?: (id: string) => void;
  className?: string;
  align?: 'start' | 'end';
}

function PinMedia({ resource }: { resource: PinnedResourceChip }) {
  if (resource.kind === 'person') {
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={UserIcon} size={14} />
      </span>
    );
  }
  if (resource.kind === 'issue') {
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Task01Icon} size={14} />
      </span>
    );
  }
  if (resource.kind === 'email') {
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Mail01Icon} size={14} />
      </span>
    );
  }
  if (resource.kind === 'social_post') {
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Share08Icon} size={14} />
      </span>
    );
  }
  return (
    <ResourceIconBox
      kind={inferResourceVisualKind(resource.type, resource.title)}
      name={resource.title}
    />
  );
}

/** Composer + transcript chips for entities pinned with the turn. */
export function PinnedResourceChipList({
  resources,
  onRemove,
  className,
  align = 'start',
}: PinnedResourceChipListProps) {
  const { t } = useTranslation();
  if (resources.length === 0) return null;

  const descriptionFor = (resource: PinnedResourceChip) => {
    if (resource.kind === 'person') return t('command.people');
    if (resource.kind === 'email') return t('email.tab_title');
    if (resource.kind === 'issue') return t('command.issues');
    if (resource.kind === 'social_post') return t('command.social_posts');
    return t('chat.group_pinned');
  };

  return (
    <AttachmentGroup
      className={cn(
        'max-w-full flex-wrap overflow-x-hidden *:data-[slot=attachment]:max-w-full',
        align === 'end' && 'justify-end',
        className,
      )}
    >
      {resources.map((resource) => (
        <Attachment
          key={`pin-${resource.id}`}
          size="sm"
          state="done"
          className="max-w-full"
          title={resource.title}
        >
          <AttachmentMedia>
            <PinMedia resource={resource} />
          </AttachmentMedia>
          <AttachmentContent className="min-w-0 overflow-hidden">
            <AttachmentTitle>{resource.title}</AttachmentTitle>
            <AttachmentDescription>{descriptionFor(resource)}</AttachmentDescription>
          </AttachmentContent>
          {onRemove ? (
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={t('chat.remove_from_context')}
                onClick={() => onRemove(resource.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </AttachmentAction>
            </AttachmentActions>
          ) : null}
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}
