import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface LearnSectionProps {
  title: string;
  count: number | string;
  seeAll?: () => void;
  children: ReactNode;
}

export default function LearnSection({ title, count, seeAll, children }: LearnSectionProps) {
  const { t } = useTranslation();

  return (
    <section>
      <div className="lr-section-hd">
        <h3>{title}</h3>
        <span className="count">{count}</span>
        {seeAll ? (
          <button type="button" className="see-all lr-btn lr-btn-ghost lr-btn-sm" onClick={seeAll}>
            {t('learn.see_all', 'See all')}
          </button>
        ) : null}
      </div>
      <div className="lr-grid">{children}</div>
    </section>
  );
}
