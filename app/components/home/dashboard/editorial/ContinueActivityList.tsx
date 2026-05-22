import { useTranslation } from 'react-i18next';
import type { ActivityItem } from '@/lib/hooks/useDashboardData';
import { formatShortDistance, getResourceTypeLabel } from '@/lib/utils';
import { DomeResourceIconBox } from '@/components/ui/DomeResourceIcon';
import type { ResourceVisualKind } from '@/lib/resources/resourceVisual';
import { HomeSectionHeader } from '@/components/home/dashboard/editorial/HomeSectionHeader';

function activityIconKind(item: ActivityItem): ResourceVisualKind {
  if (item.kind === 'chat') return 'chat';
  if (item.resourceType === 'folder') return 'folder';
  return (item.resourceType as ResourceVisualKind | undefined) ?? 'file';
}

export function ContinueActivityList({
  activity,
  loading,
  onContinue,
  onViewAll,
}: {
  activity: ActivityItem[];
  loading: boolean;
  onContinue: (item: ActivityItem) => void;
  onViewAll?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section>
      <HomeSectionHeader
        title={t('dashboard.section_continue')}
        linkLabel={t('dashboard.all_activity')}
        onLinkClick={onViewAll}
      />
      {loading ? (
        <div className="h-activity">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-activity-item animate-pulse motion-reduce:animate-none" style={{ minHeight: 48 }} />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="h-feed-empty">{t('dashboard.no_activity')}</p>
      ) : (
        <div className="h-activity">
          {activity.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              className="h-activity-item"
              onClick={() => onContinue(item)}
              disabled={item.kind === 'resource' ? !item.resourceId : !item.sessionId}
            >
              <DomeResourceIconBox
                kind={activityIconKind(item)}
                type={item.resourceType}
                name={item.title}
                size={36}
                className={item.kind === 'chat' ? 'h-activity-icon--chat' : undefined}
              />
              <div className="h-activity-body">
                <div className="h-activity-name">{item.title}</div>
                <div className="h-activity-meta">
                  <span>
                    {item.kind === 'chat'
                      ? t('dashboard.activity_kind_chat')
                      : getResourceTypeLabel(item.resourceType ?? item.subtitle ?? 'file')}
                  </span>
                </div>
              </div>
              <span className="h-activity-time">{formatShortDistance(item.timestamp)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
