import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  Mail01Icon,
  Share08Icon,
  SparklesIcon,
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
import { useInspectStore, type InspectPinKind } from '@/lib/store/useInspectStore';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import { socialProviderLabel } from '@/lib/chat/pinLabels';
import { focusSocialCreator } from '@/lib/store/useOpenIntentStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { cn } from '@/lib/utils';

export type PinnedResourceChip = Pick<PinnedResource, 'id' | 'title' | 'type' | 'kind' | 'meta'>;

export interface PinnedResourceChipListProps {
  resources: PinnedResourceChip[];
  /** When set, chips are removable (composer). Omit for transcript (read-only). */
  onRemove?: (id: string) => void;
  className?: string;
  align?: 'start' | 'end';
}

function isSocialPin(resource: PinnedResourceChip): boolean {
  return (
    resource.kind === 'social_profile'
    || resource.kind === 'social_reference'
    || resource.type === 'social_profile'
    || resource.type === 'social_reference'
  );
}

function PinMedia({ resource }: { resource: PinnedResourceChip }) {
  if (isSocialPin(resource)) {
    const name = resource.title;
    const avatar = typeof resource.meta?.avatarUrl === 'string' ? resource.meta.avatarUrl : null;
    return <SocialAccountAvatar name={name} src={avatar} size="sm" className="size-full rounded-md" />;
  }
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
    if (isSocialPin(resource)) {
      const provider = socialProviderLabel(
        typeof resource.meta?.provider === 'string' ? resource.meta.provider : null,
      );
      return `${provider} · ${t('social.studio.nav.references')}`;
    }
    if (resource.kind === 'person') return t('command.people');
    if (resource.kind === 'email') return t('email.tab_title');
    if (resource.kind === 'issue') return t('command.issues');
    if (resource.kind === 'social_post') return t('command.social_posts');
    return t('chat.group_pinned');
  };

  const openPeek = (resource: PinnedResourceChip) => {
    if (isSocialPin(resource)) {
      useTabStore.getState().openSocialTab();
      focusSocialCreator({
        personId: resource.id,
        handle: typeof resource.meta?.handle === 'string' ? resource.meta.handle : null,
        url: typeof resource.meta?.url === 'string' ? resource.meta.url : null,
      });
      return;
    }
    if (resource.kind === 'person') {
      useInspectStore.getState().open({
        kind: 'person',
        personId: resource.id,
        title: resource.title,
      });
      return;
    }
    useInspectStore.getState().open({
      kind: 'entity',
      id: resource.id,
      title: resource.title,
      entityType: resource.type,
      pinKind: (resource.kind ?? 'resource') as InspectPinKind,
    });
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
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => openPeek(resource)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPeek(resource);
              }
            }}
          >
            <AttachmentMedia>
              <PinMedia resource={resource} />
            </AttachmentMedia>
            <AttachmentContent className="min-w-0 overflow-hidden">
              <AttachmentTitle>{resource.title}</AttachmentTitle>
              <AttachmentDescription>{descriptionFor(resource)}</AttachmentDescription>
            </AttachmentContent>
          </button>
          {onRemove ? (
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={t('chat.remove_from_context')}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(resource.id);
                }}
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

export function ManySkillChipList({
  skills,
  onRemove,
  className,
  align = 'start',
}: {
  skills: Array<{ id: string; name: string }>;
  onRemove?: (id: string) => void;
  className?: string;
  align?: 'start' | 'end';
}) {
  const { t } = useTranslation();
  if (skills.length === 0) return null;
  return (
    <AttachmentGroup
      className={cn(
        'max-w-full flex-wrap overflow-x-hidden *:data-[slot=attachment]:max-w-full',
        align === 'end' && 'justify-end',
        className,
      )}
    >
      {skills.map((skill) => (
        <Attachment
          key={`skill-${skill.id}`}
          size="sm"
          state="done"
          className="max-w-full"
          title={skill.name}
        >
          <AttachmentMedia>
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={SparklesIcon} size={14} />
            </span>
          </AttachmentMedia>
          <AttachmentContent className="min-w-0 overflow-hidden">
            <AttachmentTitle>{skill.name}</AttachmentTitle>
            <AttachmentDescription>{t('chat.attached_skill')}</AttachmentDescription>
          </AttachmentContent>
          {onRemove ? (
            <AttachmentActions>
              <AttachmentAction
                type="button"
                aria-label={t('chat.remove_from_context')}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(skill.id);
                }}
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
