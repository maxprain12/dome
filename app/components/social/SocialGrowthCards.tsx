import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Building2Icon, InstagramIcon, Linkedin01Icon, MinusSignIcon, TradeDownIcon, TradeUpIcon, TwitterIcon } from '@hugeicons/core-free-icons';
import type { SocialGrowthAccount, SocialProvider } from '@/components/social/socialTypes';

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = { linkedin: Linkedin01Icon, instagram: InstagramIcon, x: TwitterIcon };

function Sparkline({ points }: { points: { t: number; followers: number | null }[] }) {
  const values = points.map((p) => p.followers).filter((v): v is number => v != null);
  if (values.length < 2) return null;
  const w = 160;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} className="block" aria-hidden>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SocialGrowthCards({ accounts }: { accounts: SocialGrowthAccount[] }) {
  const { t } = useTranslation();

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('social.hub.growth_empty')}
      </p>
    );
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {accounts.map((acc) => {
        const icon = acc.provider === 'linkedin' && acc.accountKind === 'organization'
          ? Building2Icon
          : PROVIDER_ICONS[acc.provider];
        const delta = acc.delta;
        const deltaIcon = delta == null || delta === 0 ? MinusSignIcon : delta > 0 ? TradeUpIcon : TradeDownIcon;
        const deltaColor = delta == null || delta === 0
          ? 'var(--muted-foreground)'
          : delta > 0 ? 'var(--success)' : 'var(--destructive)';
        return (
          <div
            key={acc.accountId}
            className="rounded-lg px-4 py-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-primary" />
              <span className="text-sm font-medium truncate text-foreground">
                {acc.handle || acc.displayName || acc.provider}
              </span>
            </div>
            {acc.latest?.followers != null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-foreground">
                    {Intl.NumberFormat().format(acc.latest.followers)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('social.hub.growth_followers')}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-xs" style={{ color: deltaColor }}>
                  <HugeiconsIcon icon={deltaIcon} className="size-3" />
                  {delta == null ? '—' : `${delta > 0 ? '+' : ''}${Intl.NumberFormat().format(delta)}`}
                </div>
                <div className="mt-2">
                  <Sparkline points={acc.points} />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  {acc.latest.following != null && (
                    <span>{t('social.hub.growth_following')}: {Intl.NumberFormat().format(acc.latest.following)}</span>
                  )}
                  {acc.latest.postsCount != null && (
                    <span>{t('social.hub.growth_posts')}: {Intl.NumberFormat().format(acc.latest.postsCount)}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {acc.provider === 'linkedin' && (acc.accountKind || 'member') === 'member'
                  ? t('social.hub.growth_unavailable_linkedin_member')
                  : t('social.hub.growth_pending')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
