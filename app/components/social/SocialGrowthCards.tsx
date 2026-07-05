import { useTranslation } from 'react-i18next';
import { Linkedin, Instagram, Twitter, TrendingUp, TrendingDown, Minus, Building2 } from 'lucide-react';
import type { SocialGrowthAccount } from '@/components/social/socialTypes';

const PROVIDER_ICONS = { linkedin: Linkedin, instagram: Instagram, x: Twitter } as const;

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
        stroke="var(--dome-accent)"
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
      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        {t('social.hub.growth_empty')}
      </p>
    );
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {accounts.map((acc) => {
        const Icon = acc.provider === 'linkedin' && acc.accountKind === 'organization'
          ? Building2
          : PROVIDER_ICONS[acc.provider];
        const delta = acc.delta;
        const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
        const deltaColor = delta == null || delta === 0
          ? 'var(--dome-text-muted)'
          : delta > 0 ? 'var(--success)' : 'var(--dome-error)';
        return (
          <div
            key={acc.accountId}
            className="rounded-lg px-4 py-3"
            style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="size-4 shrink-0" style={{ color: 'var(--dome-accent)' }} />
              <span className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                {acc.handle || acc.displayName || acc.provider}
              </span>
            </div>
            {acc.latest?.followers != null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold" style={{ color: 'var(--dome-text)' }}>
                    {Intl.NumberFormat().format(acc.latest.followers)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('social.hub.growth_followers')}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-xs" style={{ color: deltaColor }}>
                  <DeltaIcon className="size-3" />
                  {delta == null ? '—' : `${delta > 0 ? '+' : ''}${Intl.NumberFormat().format(delta)}`}
                </div>
                <div className="mt-2">
                  <Sparkline points={acc.points} />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {acc.latest.following != null && (
                    <span>{t('social.hub.growth_following')}: {Intl.NumberFormat().format(acc.latest.following)}</span>
                  )}
                  {acc.latest.postsCount != null && (
                    <span>{t('social.hub.growth_posts')}: {Intl.NumberFormat().format(acc.latest.postsCount)}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
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
