import { useMemo } from 'react';
import { CircleDot, CheckCircle2, Calendar, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient, parseLabels } from '@/lib/github/client';

/**
 * Kanban matching GitHub milestones ⇄ Dome columns.
 * Columns = milestones (+ "Sin milestone"). Each card is an issue; moving a card
 * reassigns its milestone (pushed to GitHub), and the open/closed toggle changes
 * its state. This is the "match de Kanban e hitos" from the spec.
 */
export default function KanbanBoard({ onOpenIssue, query = '' }: { onOpenIssue: (id: string) => void; query?: string }) {
  const { t } = useTranslation();
  const milestones = useGitHubStore((s) => s.milestones);
  const allIssues = useGitHubStore((s) => s.issues);
  const syncNow = useGitHubStore((s) => s.syncNow);

  const q = query.trim().toLowerCase();
  const issues = useMemo(() => {
    if (!q) return allIssues;
    return allIssues.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      String(i.number) === q.replace(/^#/, '') ||
      parseLabels(i.labels).some((l) => l.toLowerCase().includes(q)),
    );
  }, [allIssues, q]);

  const columns = useMemo(() => {
    const cols: Array<{ key: string; title: string; dueOn: number | null; milestoneNumber: number | null; url: string | null }> = [
      { key: 'none', title: t('github.no_milestone'), dueOn: null, milestoneNumber: null, url: null },
    ];
    for (const m of milestones) {
      cols.push({ key: m.id, title: m.title, dueOn: m.due_on, milestoneNumber: m.number, url: m.html_url });
    }
    return cols;
  }, [milestones, t]);

  const issuesByMilestone = useMemo(() => {
    const map = new Map<number | 'none', GitHubIssueRow[]>();
    for (const issue of issues) {
      const k = issue.milestone_number ?? 'none';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(issue);
    }
    return map;
  }, [issues]);

  const move = async (issueId: string, milestoneNumber: number | null) => {
    await githubClient.issues.move(issueId, { milestoneNumber });
    void syncNow();
  };

  const toggleState = async (issue: GitHubIssueRow) => {
    await githubClient.issues.move(issue.id, { state: issue.state === 'open' ? 'closed' : 'open' });
    void syncNow();
  };

  return (
    <div className="flex gap-3 overflow-x-auto h-full p-4">
      {columns.map((col) => {
        const colIssues = issuesByMilestone.get(col.milestoneNumber ?? 'none') ?? [];
        return (
          <div
            key={col.key}
            className="flex flex-col rounded-lg shrink-0 w-72"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-sm truncate" style={{ color: 'var(--dome-text)' }}>{col.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {col.url && (
                    <a href={col.url} target="_blank" rel="noreferrer" title={t('github.open_milestone_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <span className="text-xs px-1.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                    {colIssues.length}
                  </span>
                </div>
              </div>
              {col.dueOn && (
                <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  <Calendar size={11} /> {new Date(col.dueOn).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 p-2 overflow-y-auto">
              {colIssues.map((issue) => (
                <div
                  key={issue.id}
                  role="button"
                  tabIndex={0}
                  className="rounded-md p-2.5 cursor-pointer"
                  style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
                  onClick={() => onOpenIssue(issue.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenIssue(issue.id); } }}
                >
                  <div className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void toggleState(issue); }}
                      title={issue.state === 'open' ? t('github.close_issue') : t('github.reopen_issue')}
                      style={{ color: issue.state === 'open' ? 'var(--success)' : 'var(--dome-text-muted)' }}
                    >
                      {issue.state === 'open' ? <CircleDot size={15} /> : <CheckCircle2 size={15} />}
                    </button>
                    <span className="text-sm leading-snug flex-1" style={{ color: 'var(--dome-text)' }}>
                      <span style={{ color: 'var(--dome-text-muted)' }}>#{issue.number}</span> {issue.title}
                    </span>
                    {issue.html_url && (
                      <a
                        href={issue.html_url}
                        target="_blank"
                        rel="noreferrer"
                        title={t('github.open_issue_on_github')}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--dome-text-muted)' }}
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  {parseLabels(issue.labels).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                      {parseLabels(issue.labels).slice(0, 4).map((l) => (
                        <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
                          {l}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pl-5 mt-1.5">
                    <select
                      value={issue.milestone_number ?? 'none'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => void move(issue.id, e.target.value === 'none' ? null : Number(e.target.value))}
                      className="text-[11px] w-full rounded px-1 py-0.5"
                      style={{ background: 'var(--dome-surface)', color: 'var(--dome-text-muted)', border: '1px solid var(--dome-border)' }}
                    >
                      <option value="none">{t('github.no_milestone')}</option>
                      {milestones.map((m) => (
                        <option key={m.id} value={m.number}>{m.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {colIssues.length === 0 && (
                <span className="text-xs text-center py-3" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_issues')}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
