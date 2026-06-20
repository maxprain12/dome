import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';

export interface EditorialHeroStat {
  label: string;
  value: string | number;
  sub?: string;
}

export interface EditorialPageHeroProps {
  title: string;
  subtitle?: string;
  eyebrowExtra?: string;
  actions?: ReactNode;
  /** Legacy stat card (Learn, Tags, Marketplace). */
  stat?: EditorialHeroStat;
  /** Opens the per-section guide modal from a `?` beside the title. */
  sectionGuideKey?: string;
  className?: string;
}

export function EditorialPageHero({
  title,
  subtitle,
  eyebrowExtra,
  actions,
  stat,
  sectionGuideKey,
  className = '',
}: EditorialPageHeroProps) {
  const { i18n } = useTranslation();

  const eyebrowDate = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');

  return (
    <header className={`h-hero hub-page-hero ${className}`.trim()}>
      <div className="h-hero-main">
        <div className="h-eyebrow h-hero-eyebrow">
          <span>{eyebrowDate}</span>
          {eyebrowExtra ? (
            <>
              <span className="sep" aria-hidden />
              <span>{eyebrowExtra}</span>
            </>
          ) : null}
        </div>
        <h1 className="h-page-title inline-flex items-center gap-2 min-w-0">
          <span className="min-w-0">{title}</span>
          {sectionGuideKey ? <SectionGuideHelp sectionKey={sectionGuideKey} /> : null}
        </h1>
        {subtitle ? <p className="h-hero-sub">{subtitle}</p> : null}
        {actions ? <div className="h-hero-actions">{actions}</div> : null}
      </div>
      {stat ? (
        <div className="hub-hero-stat-card" aria-label={stat.label}>
          <span className="label">{stat.label}</span>
          <span className="value">{stat.value}</span>
          {stat.sub ? <span className="sub">{stat.sub}</span> : null}
        </div>
      ) : null}
    </header>
  );
}
