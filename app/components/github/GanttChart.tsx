import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

/**
 * Lightweight CSS Gantt of milestones positioned by due date. No external dep:
 * bars are placed proportionally across the [earliest, latest] window.
 */
export default function GanttChart({ query = '' }: { query?: string }) {
  const { t } = useTranslation();
  const milestones = useGitHubStore((s) => s.milestones);

  const q = query.trim().toLowerCase();
  const dated = useMemo(
    () => milestones.filter((m) => m.due_on && (!q || m.title.toLowerCase().includes(q))),
    [milestones, q],
  );

  const { min, max } = useMemo(() => {
    if (dated.length === 0) return { min: Date.now(), max: Date.now() + 1 };
    const times = dated.map((m) => m.due_on as number);
    const lo = Math.min(...times, Date.now());
    const hi = Math.max(...times, Date.now());
    const pad = Math.max((hi - lo) * 0.1, 7 * 24 * 60 * 60 * 1000);
    return { min: lo - pad, max: hi + pad };
  }, [dated]);

  const span = Math.max(max - min, 1);
  const pct = (t: number) => ((t - min) / span) * 100;

  if (dated.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--dome-text-muted)' }}>
        {t('github.gantt_no_dated_milestones')}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="relative" style={{ minWidth: 600 }}>
        {/* Today marker */}
        <div
          className="absolute top-0 bottom-0 w-px z-10"
          style={{ left: `${pct(Date.now())}%`, background: 'var(--dome-accent)' }}
        >
          <span className="absolute -top-4 -translate-x-1/2 text-[10px]" style={{ color: 'var(--dome-accent)' }}>{t('github.gantt_today')}</span>
        </div>

        <div className="flex flex-col gap-2 mt-5">
          {dated
            .slice()
            .sort((a, b) => (a.due_on as number) - (b.due_on as number))
            .map((m) => {
              const progress = m.open_issues + m.closed_issues > 0
                ? Math.round((m.closed_issues / (m.open_issues + m.closed_issues)) * 100)
                : 0;
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-sm truncate flex items-center gap-1" style={{ color: 'var(--dome-text)' }}>
                    <span className="truncate">{m.title}</span>
                    {m.html_url && (
                      <a href={m.html_url} target="_blank" rel="noreferrer" title={t('github.open_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div className="relative flex-1 h-7 rounded" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
                    <div
                      className="absolute top-0 bottom-0 flex items-center rounded px-2 text-[11px] whitespace-nowrap"
                      style={{
                        left: `${Math.min(pct(m.due_on as number), 92)}%`,
                        background: m.state === 'closed' ? 'var(--dome-bg-hover)' : 'var(--dome-accent)',
                        color: m.state === 'closed' ? 'var(--dome-text-muted)' : 'var(--dome-on-accent)',
                      }}
                    >
                      {new Date(m.due_on as number).toLocaleDateString()} · {progress}%
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
