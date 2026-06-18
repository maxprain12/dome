import { useTranslation } from 'react-i18next';
import {
  CircleDot, CheckCircle2, GitMerge, GitPullRequest, AtSign, Tag, Link2, UserPlus, Pencil, History,
} from 'lucide-react';
import type { TFunction } from 'i18next';

function eventIcon(event: string) {
  const c = 'size-3.5 shrink-0';
  switch (event) {
    case 'closed': return <CheckCircle2 className={c} style={{ color: 'var(--dome-text-muted)' }} />;
    case 'reopened': return <CircleDot className={c} style={{ color: 'var(--success)' }} />;
    case 'merged': return <GitMerge className={c} style={{ color: 'var(--dome-accent)' }} />;
    case 'cross-referenced':
    case 'referenced':
    case 'connected':
    case 'disconnected': return <GitPullRequest className={c} style={{ color: 'var(--dome-accent)' }} />;
    case 'mentioned': return <AtSign className={c} style={{ color: 'var(--dome-text-muted)' }} />;
    case 'labeled':
    case 'unlabeled': return <Tag className={c} style={{ color: 'var(--dome-text-muted)' }} />;
    case 'assigned':
    case 'unassigned':
    case 'review_requested': return <UserPlus className={c} style={{ color: 'var(--dome-text-muted)' }} />;
    case 'renamed': return <Pencil className={c} style={{ color: 'var(--dome-text-muted)' }} />;
    default: return <Link2 className={c} style={{ color: 'var(--dome-text-muted)' }} />;
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
  if (events.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
      <div className="flex items-center gap-2">
        <History size={16} style={{ color: 'var(--dome-text-muted)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('github.timeline.title')}
        </h3>
      </div>
      <ol className="flex flex-col gap-1.5">
        {events.map((ev) => (
          <li key={ev.id} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--dome-text-secondary, var(--dome-text-muted))' }}>
            <span className="mt-0.5">{eventIcon(ev.event)}</span>
            <span className="flex-1 min-w-0">
              {eventText(ev, t)}
              {ev.source && (
                <a
                  href={ev.source.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center gap-1 underline"
                  style={{ color: 'var(--dome-accent)' }}
                  title={ev.source.title}
                >
                  {ev.source.is_pull_request ? (
                    <GitPullRequest className="size-3" style={{ color: ev.source.merged ? 'var(--dome-accent)' : undefined }} />
                  ) : (
                    <CircleDot className="size-3" />
                  )}
                  #{ev.source.number}
                  {ev.source.merged ? ` · ${t('github.timeline.merged_tag')}` : ''}
                </a>
              )}
              {ev.created_at && (
                <span className="ml-1 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
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
