import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
  className?: string;
}

export function EditorialPageHero({
  title,
  subtitle,
  eyebrowExtra,
  actions,
  stat,
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
        <h1 className="h-page-title">{title}</h1>
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
