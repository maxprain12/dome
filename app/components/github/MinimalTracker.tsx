import { useMemo, useState } from 'react';
import { Plus, Circle, CheckCircle2, Calendar, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient, parseLabels } from '@/lib/github/client';

/**
 * Minimal "chill" tracker — the default mode. A calm, list-first view of
 * milestones and their issues with a one-line quick-add. No Kanban/Gantt/tabs.
 */
export default function MinimalTracker({ query = '', onOpenIssue }: { query?: string; onOpenIssue: (id: string) => void }) {
  const { t } = useTranslation();
  const milestones = useGitHubStore((s) => s.milestones);
  const allIssues = useGitHubStore((s) => s.issues);
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const loadRepoData = useGitHubStore((s) => s.loadRepoData);
  const syncNow = useGitHubStore((s) => s.syncNow);

  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const q = query.trim().toLowerCase();
  const issues = useMemo(() => {
    const open = allIssues.filter((i) => i.state === 'open');
    if (!q) return open;
    return open.filter(
      (i) => i.title.toLowerCase().includes(q) || parseLabels(i.labels).some((l) => l.toLowerCase().includes(q)),
    );
  }, [allIssues, q]);

  const groups = useMemo(() => {
    const open = milestones.filter((m) => m.state === 'open' && (!q || m.title.toLowerCase().includes(q)));
    const byNumber = new Map<number | 'none', GitHubIssueRow[]>();
    for (const i of issues) {
      const k = i.milestone_number ?? 'none';
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k)!.push(i);
    }
    const cards = open
      .slice()
      .sort((a, b) => (a.due_on ?? Infinity) - (b.due_on ?? Infinity))
      .map((m) => ({ milestone: m, issues: byNumber.get(m.number) ?? [] }));
    const orphan = byNumber.get('none') ?? [];
    return { cards, orphan };
  }, [milestones, issues, q]);

  const toggle = async (issue: GitHubIssueRow) => {
    await githubClient.issues.move(issue.id, { state: issue.state === 'open' ? 'closed' : 'open' });
    void syncNow();
  };

  const quickAdd = async () => {
    const title = draft.trim();
    if (!title || !selectedRepoId) return;
    setAdding(true);
    await githubClient.issues.create(selectedRepoId, { title });
    setDraft('');
    setAdding(false);
    await loadRepoData(selectedRepoId);
  };

  if (!selectedRepoId) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--dome-text-muted)' }}>
        {t('github.minimal_select_repo')}
      </div>
    );
  }

  const IssueRow = ({ issue }: { issue: GitHubIssueRow }) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenIssue(issue.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenIssue(issue.id); } }}
      className="group flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md cursor-pointer"
      style={{ color: 'var(--dome-text)' }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void toggle(issue); }}
        title={t('github.minimal_mark_done')}
        style={{ color: 'var(--dome-text-muted)' }}
      >
        <Circle size={16} />
      </button>
      <span className="text-sm flex-1 truncate">{issue.title}</span>
      <ChevronRight size={14} className="opacity-0 group-hover:opacity-100" style={{ color: 'var(--dome-text-muted)' }} />
    </div>
  );

  return (
    <div className="h-full overflow-auto px-4 py-4 mx-auto w-full max-w-3xl">
      {/* Quick add */}
      <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
        <Plus size={16} style={{ color: 'var(--dome-text-muted)' }} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void quickAdd(); }}
          placeholder={t('github.minimal_add_task_placeholder')}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--dome-text)' }}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={() => void quickAdd()}
            disabled={adding}
            className="text-xs px-2.5 py-1 rounded-md"
            style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', opacity: adding ? 0.6 : 1 }}
          >
            {t('github.minimal_add')}
          </button>
        )}
      </div>

      {/* Milestone cards */}
      <div className="flex flex-col gap-4">
        {groups.cards.map(({ milestone: m, issues: list }) => {
          const total = m.open_issues + m.closed_issues;
          const pct = total > 0 ? Math.round((m.closed_issues / total) * 100) : 0;
          return (
            <div key={m.id} className="rounded-xl p-4" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: 'var(--dome-text)' }}>{m.title}</span>
                {m.due_on && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    <Calendar size={12} /> {new Date(m.due_on).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'var(--dome-bg-hover)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--dome-accent)' }} />
              </div>
              {list.length === 0 ? (
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('github.minimal_no_open_tasks')}</span>
              ) : (
                list.map((issue) => <IssueRow key={issue.id} issue={issue} />)
              )}
            </div>
          );
        })}

        {groups.orphan.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
            <span className="font-semibold block mb-2" style={{ color: 'var(--dome-text)' }}>{t('github.minimal_other_tasks')}</span>
            {groups.orphan.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
          </div>
        )}

        {groups.cards.length === 0 && groups.orphan.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <CheckCircle2 size={28} style={{ color: 'var(--dome-text-muted)' }} />
            <span className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>{t('github.minimal_all_done')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
