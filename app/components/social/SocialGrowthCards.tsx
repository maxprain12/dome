import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Building2Icon,
  InstagramIcon,
  Linkedin01Icon,
  MinusSignIcon,
  TradeDownIcon,
  TradeUpIcon,
  TwitterIcon,
} from '@hugeicons/core-free-icons';
import type { SocialGrowthAccount, SocialProvider } from '@/components/social/socialTypes';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';
import { SOCIAL_KPI_CARD_CLASS, SOCIAL_KPI_STRIP_CLASS } from './socialKpiLayout';

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = {
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  x: TwitterIcon,
};

/** Always-visible presence KPIs (compact strip). Click focuses that account. */
export default function SocialGrowthCards({
  accounts,
  focusAccountId,
  onFocusAccount,
}: {
  accounts: SocialGrowthAccount[];
  focusAccountId?: string | null;
  onFocusAccount?: (accountId: string | null) => void;
}) {
  const { t } = useTranslation();

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t('social.hub.growth_empty')}</p>
    );
  }

  return (
    <div className={SOCIAL_KPI_STRIP_CLASS}>
      {accounts.map((acc) => {
        const icon =
          acc.provider === 'linkedin' && acc.accountKind === 'organization'
            ? Building2Icon
            : PROVIDER_ICONS[acc.provider];
        const delta = acc.delta;
        const deltaIcon =
          delta == null || delta === 0
            ? MinusSignIcon
            : delta > 0
              ? TradeUpIcon
              : TradeDownIcon;
        const deltaColor =
          delta == null || delta === 0
            ? 'text-muted-foreground'
            : delta > 0
              ? 'text-success'
              : 'text-destructive';
        const unavailable =
          acc.followersUnavailable === 'linkedin_member' ||
          (acc.provider === 'linkedin' &&
            (acc.accountKind || 'member') === 'member' &&
            acc.latest?.followers == null);
        const active = focusAccountId === acc.accountId;
        const label = acc.handle || acc.displayName || acc.provider;

        return (
          <button
            key={acc.accountId}
            type="button"
            onClick={() =>
              onFocusAccount?.(active ? null : acc.accountId)
            }
            title={
              unavailable
                ? t('social.hub.growth_unavailable_linkedin_member')
                : `${acc.provider} · ${label}`
            }
            data-active={active ? 'true' : undefined}
            className={cn(
              selectionSurfaceClass(active, SOCIAL_KPI_CARD_CLASS),
              !active && 'border-border bg-card',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs font-medium text-foreground">{label}</span>
            </span>
            {acc.latest?.followers != null ? (
              <span className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {Intl.NumberFormat().format(acc.latest.followers)}
                  </span>
                  <span className={cn('inline-flex items-center gap-0.5 text-[11px] tabular-nums', deltaColor)}>
                    <HugeiconsIcon icon={deltaIcon} className="size-2.5" />
                    {delta == null
                      ? '—'
                      : `${delta > 0 ? '+' : ''}${Intl.NumberFormat().format(delta)}`}
                  </span>
                </span>
                {acc.latest.following != null ? (
                  <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {acc.provider === 'linkedin' && (acc.accountKind || 'member') === 'member'
                      ? t('social.hub.growth_connections', {
                          defaultValue: 'conexiones',
                        })
                      : t('social.hub.growth_following')}
                    : {Intl.NumberFormat().format(acc.latest.following)}
                  </span>
                ) : null}
                {acc.latest.postsCount != null ? (
                  <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {t('social.hub.growth_posts')}: {Intl.NumberFormat().format(acc.latest.postsCount)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex flex-1 items-end text-xs text-muted-foreground">
                {unavailable ? t('social.agent_presence_na') : t('social.hub.growth_pending')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
