import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { CircleDot, CheckCircle2, Calendar, ExternalLink, GripVertical, Plus, X, Milestone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { useGitHubSortStore } from '@/lib/store/useGitHubSortStore';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import GitHubSortControls from './GitHubSortControls';

/**
 * Kanban matching GitHub milestones ⇄ Dome columns.
 * Columns = milestones (+ "Sin milestone"). Cards can be reordered within a
 * column and dragged to another column to reassign the milestone. State toggle
 * (open / closed) remains on the card. Drag uses native HTML5 events to avoid
 * adding a dependency, matching the file-tree pattern.
 */
type ColumnKey = number | 'none';

export default function KanbanBoard({ onOpenIssue, query = '' }: { onOpenIssue: (id: string) => void; query?: string }) {
  const { t } = useTranslation();
  const milestones = useGitHubStore((s) => s.milestones);
  const allIssues = useGitHubStore((s) => s.issues);
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const loadRepoData = useGitHubStore((s) => s.loadRepoData);
  const syncNow = useGitHubStore((s) => s.syncNow);

  const q = query.trim().toLowerCase();
  const columnSort = useGitHubSortStore((s) => s.milestones);
  const setColumnSort = useGitHubSortStore((s) => s.setMilestoneSort);
  const cardSort = useGitHubSortStore((s) => s.issues);
  const setCardSort = useGitHubSortStore((s) => s.setIssueSort);

  const issues = useMemo(() => {
    if (!q) return allIssues;
    return allIssues.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      String(i.number) === q.replace(/^#/, '') ||
      parseLabels(i.labels).some((l) => l.toLowerCase().includes(q)),
    );
  }, [allIssues, q]);

  const columns = useMemo(() => {
    const cols: Array<{ key: ColumnKey; title: string; dueOn: number | null; milestoneNumber: number | null; url: string | null; state: 'open' | 'closed' | null }> = [
      { key: 'none', title: t('github.no_milestone'), dueOn: null, milestoneNumber: null, url: null, state: null },
    ];
    for (const m of milestones) {
      cols.push({ key: m.number, title: m.title, dueOn: m.due_on, milestoneNumber: m.number, url: m.html_url, state: m.state });
    }
    // "Sin milestone" always stays first regardless of the sort.
    const noneCol = cols.shift()!;
    const milestoneCols = cols.slice();
    switch (columnSort) {
      case 'newest':
        milestoneCols.sort((a, b) => (b.milestoneNumber ?? 0) - (a.milestoneNumber ?? 0));
        break;
      case 'oldest':
        milestoneCols.sort((a, b) => (a.milestoneNumber ?? 0) - (b.milestoneNumber ?? 0));
        break;
      case 'due_date':
        // Milestones without a due_on go last; earlier due dates first.
        milestoneCols.sort((a, b) => {
          if (a.dueOn == null && b.dueOn == null) return 0;
          if (a.dueOn == null) return 1;
          if (b.dueOn == null) return -1;
          return a.dueOn - b.dueOn;
        });
        break;
      case 'state':
        // Open milestones first, then closed (stable within each group by number desc).
        milestoneCols.sort((a, b) => {
          const ao = a.state === 'open' ? 0 : 1;
          const bo = b.state === 'open' ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return (b.milestoneNumber ?? 0) - (a.milestoneNumber ?? 0);
        });
        break;
    }
    return [noneCol, ...milestoneCols];
  }, [milestones, t, columnSort]);

  const issuesByMilestone = useMemo(() => {
    const map = new Map<ColumnKey, GitHubIssueRow[]>();
    for (const issue of issues) {
      const k: ColumnKey = issue.milestone_number ?? 'none';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(issue);
    }
    // Sort each column's cards in-place according to cardSort.
    for (const [key, list] of map) {
      const sorted = [...list];
      switch (cardSort) {
        case 'newest':
          sorted.sort((a, b) => b.number - a.number);
          break;
        case 'oldest':
          sorted.sort((a, b) => a.number - b.number);
          break;
        case 'status':
          // Open first, then closed; stable by number desc within each group.
          sorted.sort((a, b) => {
            const ao = a.state === 'open' ? 0 : 1;
            const bo = b.state === 'open' ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return b.number - a.number;
          });
          break;
      }
      map.set(key, sorted);
    }
    return map;
  }, [issues, cardSort]);

  const move = async (issueId: string, milestoneNumber: number | null) => {
    await githubClient.issues.move(issueId, { milestoneNumber });
    void syncNow();
  };

  const toggleState = async (issue: GitHubIssueRow) => {
    await githubClient.issues.move(issue.id, { state: issue.state === 'open' ? 'closed' : 'open' });
    void syncNow();
  };

  // Horizontal wheel-scroll + drag for the columns row (mouse wheel → scrollLeft).
  const boardScrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(boardScrollRef);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sort filters bar — minimal icon-only buttons with dropdown menu */}
      <div
        className="flex items-center gap-1 px-4 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--dome-border, var(--border))' }}
      >
        <GitHubSortControls />
      </div>

      <div ref={boardScrollRef} className="flex gap-3 overflow-x-auto flex-1 p-4 min-h-0">
        {columns.map((col) => (
          <KanbanColumn
            key={String(col.key)}
            title={col.title}
            dueOn={col.dueOn}
            url={col.url}
            milestoneNumber={col.milestoneNumber}
            issues={issuesByMilestone.get(col.key) ?? []}
            onOpenIssue={onOpenIssue}
            onDrop={(issueId) => move(issueId, col.milestoneNumber)}
            onToggleState={toggleState}
          />
        ))}
        {selectedRepoId && (
          <NewMilestoneColumn
            onCreate={async ({ title, description, dueOn }) => {
              await githubClient.milestones.create(selectedRepoId, {
                title,
                description: description.trim() || undefined,
                dueOn: dueOn || undefined,
              });
              // Full reload so the new milestone + column appear in the store.
              await loadRepoData(selectedRepoId);
              void syncNow();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  title: string;
  dueOn: number | null;
  url: string | null;
  milestoneNumber: number | null;
  issues: GitHubIssueRow[];
  onOpenIssue: (id: string) => void;
  onDrop: (issueId: string) => void;
  onToggleState: (issue: GitHubIssueRow) => Promise<void> | void;
}

function KanbanColumn({
  title, dueOn, url, issues, onOpenIssue, onDrop, onToggleState,
}: KanbanColumnProps) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/x-dome-issue')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    const id = e.dataTransfer.getData('application/x-dome-issue');
    if (id) onDrop(id);
  };

  return (
    <div
      className="flex flex-col rounded-lg shrink-0 w-72 transition-colors"
      style={{
        background: 'var(--dome-surface)',
        border: `1px solid ${isOver ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        boxShadow: isOver ? '0 0 0 1px var(--dome-accent) inset' : undefined,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--dome-border)' }}>
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--dome-text)' }}>{title}</span>
          <div className="flex items-center gap-1 shrink-0">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" title={t('github.open_milestone_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
                <ExternalLink size={12} />
              </a>
            )}
            <span className="text-xs px-1.5 rounded" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>
              {issues.length}
            </span>
          </div>
        </div>
        {dueOn && (
          <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
            <Calendar size={11} /> {new Date(dueOn).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto min-h-[40px]">
        {issues.map((issue) => (
          <KanbanCard
            key={issue.id}
            issue={issue}
            onOpen={() => onOpenIssue(issue.id)}
            onToggleState={() => onToggleState(issue)}
          />
        ))}
        {issues.length === 0 && (
          <span className="text-xs text-center py-3" style={{ color: 'var(--dome-text-muted)' }}>
            {isOver ? '↧' : t('github.no_issues')}
          </span>
        )}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  issue: GitHubIssueRow;
  onOpen: () => void;
  onToggleState: () => void;
}

function KanbanCard({ issue, onOpen, onToggleState }: KanbanCardProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  const handleDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/x-dome-issue', issue.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  const handleDragEnd = () => setDragging(false);

  const labels = parseLabels(issue.labels);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
      className="rounded-md p-2.5 cursor-grab active:cursor-grabbing transition-opacity"
      style={{
        background: 'var(--dome-bg)',
        border: '1px solid var(--dome-border)',
        opacity: dragging ? 0.55 : 1,
      }}
      aria-grabbed={dragging}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="shrink-0 mt-1" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
        <button
          type="button"
          draggable={false}
          onClick={(e) => { e.stopPropagation(); onToggleState(); }}
          title={issue.state === 'open' ? t('github.close_issue') : t('github.reopen_issue')}
          aria-label={issue.state === 'open' ? t('github.close_issue') : t('github.reopen_issue')}
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
            aria-label={t('github.open_issue_on_github')}
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
          {labels.slice(0, 4).map((l) => (
            <span
              key={l}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface NewMilestoneColumnProps {
  onCreate: (data: { title: string; description: string; dueOn: number | null }) => Promise<void>;
}

/**
 * Always-last column on the Kanban board. Lets the user create a new milestone
 * inline without leaving the view. Collapsed by default to a small "+ New
 * milestone" button; opens to a compact form (title + description + due date).
 * Not a drop target — once created, the new milestone shows up as a real column.
 */
function NewMilestoneColumn({ onCreate }: NewMilestoneColumnProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => titleRef.current?.focus());
    } else {
      setTitle('');
      setDescription('');
      setDueDate('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t('github.new_milestone_error_title'));
      titleRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dueOn = dueDate ? new Date(`${dueDate}T00:00:00`).getTime() : null;
      await onCreate({ title: trimmed, description, dueOn });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('github.new_milestone_error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 rounded-lg shrink-0 w-72 self-stretch min-h-[120px] transition-colors"
        style={{
          background: 'transparent',
          border: '1px dashed var(--dome-border)',
          color: 'var(--dome-text-muted)',
          cursor: 'pointer',
        }}
        title={t('github.new_milestone_column')}
        aria-label={t('github.new_milestone_column')}
      >
        <Plus size={18} />
        <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
          {t('github.new_milestone_column')}
        </span>
      </button>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onKeyDown handles Escape + Cmd/Ctrl+Enter, both are keyboard shortcuts for cancel/submit.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={onKeyDown}
      className="flex flex-col rounded-lg shrink-0 w-72"
      style={{
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-accent)',
        boxShadow: '0 0 0 1px var(--dome-accent) inset',
      }}
      aria-label={t('github.new_milestone_column')}
    >
      <div
        className="px-3 py-2 border-b flex items-center justify-between gap-1"
        style={{ borderColor: 'var(--dome-border)' }}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-sm truncate" style={{ color: 'var(--dome-text)' }}>
          <Milestone size={13} />
          {t('github.new_milestone_column')}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('github.new_milestone_cancel')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dome-text-muted)',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('github.new_milestone_title_label')}
          </span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t('github.new_milestone_title_placeholder')}
            aria-invalid={!!error}
            aria-describedby={error ? 'new-milestone-error' : undefined}
            className="text-sm rounded-md px-2 py-1 outline-none"
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text)',
              border: `1px solid ${error ? 'var(--dome-error)' : 'var(--dome-border)'}`,
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('github.new_milestone_description_label')}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('github.new_milestone_description_placeholder')}
            rows={3}
            className="text-sm rounded-md px-2 py-1 outline-none resize-none"
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text)',
              border: '1px solid var(--dome-border)',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--dome-text-muted)' }}>
            <Calendar size={10} />
            {t('github.new_milestone_due_label')}
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            placeholder={t('github.new_milestone_due_placeholder')}
            className="text-sm rounded-md px-2 py-1 outline-none"
            style={{
              background: 'var(--dome-bg)',
              color: 'var(--dome-text)',
              border: '1px solid var(--dome-border)',
              colorScheme: 'dark',
            }}
          />
        </label>

        {error && (
          <p id="new-milestone-error" className="text-[11px] flex items-center gap-1" style={{ color: 'var(--dome-error)' }}>
            <X size={10} />
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="text-xs px-2.5 py-1 rounded-md"
            style={{
              background: 'transparent',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text-muted)',
              cursor: 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {t('github.new_milestone_cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1"
            style={{
              background: 'var(--dome-accent)',
              color: 'var(--dome-on-accent)',
              border: 'none',
              cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !title.trim() ? 0.6 : 1,
            }}
          >
            <Plus size={12} />
            {submitting ? t('github.new_milestone_creating') : t('github.new_milestone_create')}
          </button>
        </div>
      </div>
    </form>
  );
}
