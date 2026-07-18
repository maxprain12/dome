import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AtSignIcon, CheckmarkCircle02Icon, CircleDotIcon, GitMergeIcon, GitPullRequestIcon, HistoryIcon, Link02Icon, PencilIcon, Tag01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';
import type { TFunction } from 'i18next';

function eventIcon(event: string) {
  const c = 'size-3.5 shrink-0';
  switch (event) {
    case 'closed': return <HugeiconsIcon icon={CheckmarkCircle02Icon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
    case 'reopened': return <HugeiconsIcon icon={CircleDotIcon} className={c} style={{ color: 'var(--success)' }} />;
    case 'merged': return <HugeiconsIcon icon={GitMergeIcon} className={c} style={{ color: 'var(--primary)' }} />;
    case 'cross-referenced':
    case 'referenced':
    case 'connected':
    case 'disconnected': return <HugeiconsIcon icon={GitPullRequestIcon} className={c} style={{ color: 'var(--primary)' }} />;
    case 'mentioned': return <HugeiconsIcon icon={AtSignIcon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
    case 'labeled':
    case 'unlabeled': return <HugeiconsIcon icon={Tag01Icon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
    case 'assigned':
    case 'unassigned':
    case 'review_requested': return <HugeiconsIcon icon={UserAdd01Icon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
    case 'renamed': return <HugeiconsIcon icon={PencilIcon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
    default: return <HugeiconsIcon icon={Link02Icon} className={c} style={{ color: 'var(--muted-foreground)' }} />;
  }
}

function eventText(ev: GitHubTimelineEvent, t: TFunction): string {
  const actor = ev.actor || t('github.anonymous_user');
  if (ev.event === 'closed' && ev.state_reason === 'completed') {
    return t('github.timeline.closed_completed', { actor, defaultValue: '' }) || t('github.timeline.closed', { actor });
  }
  const key = `github.timeline.${ev.event}`;
  const translated = t(key, {
    actor,
    label: ev.label ?? '',
    from: ev.rename?.from ?? '',
    to: ev.rename?.to ?? '',
    defaultValue: '',
  });
  if (translated) return translated;
  return t('github.timeline.generic', { actor, event: ev.event });
}

function relTime(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function IssueTimeline({ events }: { events: GitHubTimelineEvent[] }) {
  const { t } = useTranslation();
  if (events.length === 0) {
    return (
      <p className="px-1 text-sm italic text-muted-foreground">{t('github.timeline.empty')}</p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <HugeiconsIcon icon={HistoryIcon} size={15} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          {t('github.timeline.title')}
        </h3>
      </div>
      <ol className="flex flex-col gap-2 px-1">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="flex items-start gap-2.5 text-[13px] py-1.5 rounded-md text-muted-foreground"
          >
            <span className="mt-0.5 shrink-0">{eventIcon(ev.event)}</span>
            <span className="flex-1 min-w-0 leading-relaxed">
              {eventText(ev, t)}
              {ev.source && (
                <a
                  href={ev.source.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center gap-1 underline text-primary"
                  title={ev.source.title}
                >
                  {ev.source.is_pull_request ? (
                    <HugeiconsIcon icon={GitPullRequestIcon} className="size-3" style={{ color: ev.source.merged ? 'var(--primary)' : undefined }} />
                  ) : (
                    <HugeiconsIcon icon={CircleDotIcon} className="size-3" />
                  )}
                  #{ev.source.number}
                  {ev.source.merged ? ` · ${t('github.timeline.merged_tag')}` : ''}
                </a>
              )}
              {ev.created_at && (
                <span className="ml-1 text-[11px] text-muted-foreground">
                  · {relTime(ev.created_at)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
