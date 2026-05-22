import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { PendingTodayItem } from '@/lib/hooks/useDashboardData';

export function TodayBrief({
  items,
  loading,
  onItemClick,
}: {
  items: PendingTodayItem[];
  loading: boolean;
  onItemClick: (item: PendingTodayItem) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="h-today">
      <div className="h-today-hd">
        <h2 className="h-today-title">{t('dashboard.section_today')}</h2>
        <span className="h-today-count">{t('dashboard.today_count', { count: items.length })}</span>
      </div>
      <p className="h-today-sub">{t('dashboard.today_sub')}</p>

      {loading ? (
        <div className="h-feed">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-feed-item animate-pulse motion-reduce:animate-none" style={{ minHeight: 48 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="h-feed-empty">{t('dashboard.pending_empty')}</p>
      ) : (
        <div className="h-feed">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`h-feed-item ${item.isNow ? 'now' : ''}`}
              onClick={() => onItemClick(item)}
            >
              <div className="h-feed-time">
                {item.timeLabel ?? '—'}
                {item.ampm ? <span className="ampm">{item.ampm}</span> : null}
              </div>
              <div className="h-feed-body">
                <div className="h-feed-title">{item.title}</div>
                <div className="h-feed-meta">
                  {item.tag ? (
                    <span className={`tag ${item.tagKind ?? ''}`}>{item.tag}</span>
                  ) : null}
                  {item.subtitle ? (
                    <>
                      {item.tag ? <span className="dotsep" aria-hidden /> : null}
                      <span>{item.subtitle}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="h-feed-arrow" size={16} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
