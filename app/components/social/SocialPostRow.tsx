import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { InstagramIcon, Linkedin01Icon, TwitterIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { SocialPost, SocialProvider } from '@/components/social/socialTypes';
import { formatSocialWhen, postSnippet } from '@/lib/social/socialQueues';
import { cn } from '@/lib/utils';

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = {
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  x: TwitterIcon,
};

export function SocialPostRow({
  post,
  active,
  onOpen,
  compact,
}: {
  post: SocialPost;
  active?: boolean;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const when =
    formatSocialWhen(post.scheduledAt ?? post.publishedAt ?? post.updatedAt, i18n.language) ||
    '';
  const snippet = postSnippet(post) || t('social.hub.no_text');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left',
        active ? 'bg-accent' : 'hover:bg-accent',
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HugeiconsIcon icon={PROVIDER_ICONS[post.provider]} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{snippet}</span>
          {when ? (
            <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{when}</time>
          ) : null}
        </span>
        {!compact ? (
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="h-auto overflow-visible py-0.5 leading-none">
              {t(`social.hub.status_${post.status}`)}
            </Badge>
            {post.campaign ? (
              <Badge variant="outline" className="h-auto max-w-[10rem] truncate overflow-visible py-0.5 leading-none">
                {post.campaign}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}
