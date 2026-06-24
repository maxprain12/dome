import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Plus, Circle, CheckCircle2, Calendar, ChevronRight, Inbox, Target, Hash, X, CheckCircle, FileText } from 'lucide-react';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import { useTranslation } from 'react-i18next';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { useGitHubSortStore } from '@/lib/store/useGitHubSortStore';
import { githubClient, parseLabels } from '@/lib/github/client';
import GitHubSortControls from './GitHubSortControls';

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

  const q = query.trim().toLowerCase();
  const milestoneSort = useGitHubSortStore((s) => s.milestones);
  const setMilestoneSort = useGitHubSortStore((s) => s.setMilestoneSort);
  const issueSort = useGitHubSortStore((s) => s.issues);
  const setIssueSort = useGitHubSortStore((s) => s.setIssueSort);

  const issues = useMemo(() => {
    let open = allIssues.filter((i) => i.state === 'open');
    if (q) {
      open = open.filter(
        (i) => i.title.toLowerCase().includes(q) || parseLabels(i.labels).some((l) => l.toLowerCase().includes(q)),
      );
    }
    const sorted = [...open];
    switch (issueSort) {
      case 'newest':
        sorted.sort((a, b) => b.number - a.number);
        break;
      case 'oldest':
        sorted.sort((a, b) => a.number - b.number);
        break;
      case 'status':
        // open already filtered; stable by number desc.
        sorted.sort((a, b) => b.number - a.number);
        break;
    }
    return sorted;
  }, [allIssues, q, issueSort]);

  const groups = useMemo(() => {
    const open = milestones.filter((m) => m.state === 'open' && (!q || m.title.toLowerCase().includes(q)));
    const byNumber = new Map<number | 'none', GitHubIssueRow[]>();
    for (const i of issues) {
      const k = i.milestone_number ?? 'none';
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k)!.push(i);
    }
    const sortedMilestones = [...open];
    switch (milestoneSort) {
      case 'due_date':
        sortedMilestones.sort((a, b) => (a.due_on ?? Infinity) - (b.due_on ?? Infinity));
        break;
      case 'newest':
        sortedMilestones.sort((a, b) => b.number - a.number);
        break;
      case 'oldest':
        sortedMilestones.sort((a, b) => a.number - b.number);
        break;
      case 'state':
        // All open here (we filtered above), so this is a stable no-op that
        // keeps newest-first within the open set.
        sortedMilestones.sort((a, b) => b.number - a.number);
        break;
    }
    const cards = sortedMilestones.map((m) => ({ milestone: m, issues: byNumber.get(m.number) ?? [] }));
    const orphan = byNumber.get('none') ?? [];
    return { cards, orphan };
  }, [milestones, issues, q, milestoneSort]);

  const toggle = async (issue: GitHubIssueRow) => {
    await githubClient.issues.move(issue.id, { state: issue.state === 'open' ? 'closed' : 'open' });
    void syncNow();
  };

  if (!selectedRepoId) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--dome-text-muted)' }}>
        {t('github.minimal_select_repo')}
      </div>
    );
  }

  const QuickCreateIssue = () => {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [milestoneChoice, setMilestoneChoice] = useState<string>('none');
    const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [bodyOpen, setBodyOpen] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      titleRef.current?.focus();
    }, []);

    const reset = () => {
      setTitle('');
      setBody('');
      setMilestoneChoice('none');
      setNewMilestoneTitle('');
      setBodyOpen(false);
      setError(null);
    };

    const handleSubmit = async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = title.trim();
      if (!trimmed || !selectedRepoId) {
        setError(t('github.minimal_quick_error_title'));
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        let milestoneNumber: number | null = null;
        if (milestoneChoice === '__new__') {
          const mTitle = newMilestoneTitle.trim();
          if (mTitle) {
            const created = await githubClient.milestones.create(selectedRepoId, { title: mTitle });
            const num = (created as { number?: number } | null)?.number;
            if (typeof num === 'number') milestoneNumber = num;
          }
        } else if (milestoneChoice !== 'none') {
          milestoneNumber = Number(milestoneChoice);
        }
        await githubClient.issues.create(selectedRepoId, {
          title: trimmed,
          body: body.trim() || undefined,
          ...(milestoneNumber !== null ? { milestoneNumber } : {}),
        });
        reset();
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
        await loadRepoData(selectedRepoId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    };

    const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    };

    return (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="rounded-xl mb-5 p-2.5 flex flex-col gap-2"
        style={{
          background: 'var(--dome-surface)',
          border: '1px solid var(--dome-border)',
        }}
      >
        {/* Row 1: title + submit */}
        <div
          className="flex items-center gap-2 rounded-md px-2"
          style={{
            background: 'var(--dome-bg)',
            border: `1px solid ${error ? 'var(--dome-error, var(--error))' : 'var(--dome-border)'}`,
            height: 32,
          }}
        >
          <Plus size={14} style={{ color: 'var(--dome-text-muted)' }} className="shrink-0" />
          <input
            id="quick-issue-title"
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
            onKeyDown={onTitleKeyDown}
            placeholder={t('github.minimal_quick_title_placeholder')}
            className="flex-1 bg-transparent outline-none text-sm min-w-0"
            style={{ color: 'var(--dome-text)' }}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'quick-issue-error' : undefined}
            aria-label={t('github.minimal_quick_title_label')}
          />
          {success && (
            <span
              className="inline-flex items-center gap-1 text-[11px] shrink-0"
              style={{ color: 'var(--dome-success)' }}
              role="status"
            >
              <CheckCircle size={12} />
              {t('github.minimal_quick_created')}
            </span>
          )}
        </div>

        {error && (
          <p
            id="quick-issue-error"
            className="text-[11px] flex items-center gap-1 -mt-1"
            style={{ color: 'var(--dome-error, var(--error))' }}
            role="alert"
          >
            <X size={11} />
            {error}
          </p>
        )}

        {/* Row 2: milestone + body toggle + cancel/create */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <DomeSelectMenu
            value={milestoneChoice}
            onChange={setMilestoneChoice}
            aria-label={t('github.minimal_quick_milestone_label')}
            fullWidth={false}
            options={[
              { value: 'none', label: t('github.minimal_quick_milestone_none') },
              ...milestones
                .filter((m) => m.state === 'open')
                .map((m) => ({ value: String(m.number), label: m.title })),
              { value: '__new__', label: t('github.minimal_quick_milestone_new') },
            ]}
          />

          <button
            type="button"
            onClick={() => setBodyOpen((v) => !v)}
            aria-expanded={bodyOpen}
            aria-controls="quick-issue-body"
            title={t('github.minimal_quick_body_label')}
            className="inline-flex items-center gap-1 text-xs px-2 h-7 rounded-md shrink-0"
            style={{
              background: bodyOpen ? 'var(--dome-bg-hover)' : 'transparent',
              border: '1px solid var(--dome-border)',
              color: bodyOpen ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              cursor: 'pointer',
            }}
          >
            <FileText size={12} />
            {bodyOpen ? '−' : '+'}
          </button>

          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={reset}
              disabled={submitting}
              className="text-xs px-2.5 h-7 rounded-md"
              style={{
                background: 'transparent',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-text-muted)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {t('github.minimal_quick_cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="text-xs px-3 h-7 rounded-md font-medium"
              style={{
                background: 'var(--dome-accent)',
                color: 'var(--dome-on-accent)',
                border: 'none',
                cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !title.trim() ? 0.55 : 1,
              }}
            >
              {submitting ? t('github.minimal_quick_creating') : t('github.minimal_quick_create')}
            </button>
          </div>
        </div>

        {milestoneChoice === '__new__' && (
          <input
            type="text"
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            placeholder={t('github.minimal_quick_milestone_create_placeholder')}
            aria-label={t('github.minimal_quick_milestone_create_label')}
            className="rounded-md px-2 text-sm outline-none"
            style={{
              background: 'var(--dome-bg)',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text)',
              height: 28,
            }}
            autoComplete="off"
          />
        )}

        {bodyOpen && (
          <textarea
            id="quick-issue-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('github.minimal_quick_body_placeholder')}
            aria-label={t('github.minimal_quick_body_placeholder')}
            rows={3}
            className="w-full rounded-md px-2 py-1.5 text-sm outline-none resize-y"
            style={{
              background: 'var(--dome-bg)',
              border: '1px solid var(--dome-border)',
              color: 'var(--dome-text)',
              minHeight: 60,
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        )}
      </form>
    );
  };

  const IssueRow = ({ issue }: { issue: GitHubIssueRow }) => {
    const labels = parseLabels(issue.labels);
    const visibleLabels = labels.slice(0, 3);
    const hiddenCount = labels.length - visibleLabels.length;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenIssue(issue.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenIssue(issue.id); } }}
        className="group flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-md cursor-pointer transition-colors"
        style={{ color: 'var(--dome-text)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--dome-bg-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void toggle(issue); }}
          title={t('github.minimal_mark_done')}
          aria-label={t('github.minimal_mark_done')}
          className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded"
          style={{
            width: 18,
            height: 18,
            color: 'var(--dome-text-muted)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-success)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)'; }}
        >
          <Circle size={15} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center gap-0.5 shrink-0 text-[11px] font-mono"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <Hash size={11} />
              {issue.number}
            </span>
            <span className="text-sm flex-1 truncate">{issue.title}</span>
          </div>
          {visibleLabels.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {visibleLabels.map((label) => (
                <span
                  key={label}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)',
                    color: 'var(--dome-accent)',
                    border: '1px solid color-mix(in srgb, var(--dome-accent) 22%, transparent)',
                  }}
                >
                  {label}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                  +{hiddenCount}
                </span>
              )}
            </div>
          )}
        </div>

        <ChevronRight
          size={14}
          className="opacity-0 group-hover:opacity-100 shrink-0 mt-1.5 transition-opacity"
          style={{ color: 'var(--dome-text-muted)' }}
        />
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto px-4 py-4 mx-auto w-full max-w-3xl">
      <QuickCreateIssue />

      {/* Sort filters — icon-only buttons aligned right, minimal */}
      <div className="flex items-center justify-end gap-1 mb-2 -mt-1">
        <GitHubSortControls />
      </div>

      {/* Milestone cards */}
      <div className="flex flex-col gap-3">
        {groups.cards.map(({ milestone: m, issues: list }) => {
          const total = m.open_issues + m.closed_issues;
          const pct = total > 0 ? Math.round((m.closed_issues / total) * 100) : 0;
          const due = m.due_on ? new Date(m.due_on) : null;
          const dueLabel = due
            ? due.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
            : null;
          return (
            <div
              key={m.id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            >
              {/* Card header */}
              <div className="flex items-start gap-3 px-4 pt-3 pb-2.5">
                <span
                  className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-md"
                  style={{
                    width: 24,
                    height: 24,
                    background: 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-bg))',
                    color: 'var(--dome-accent)',
                  }}
                >
                  <Target size={13} strokeWidth={2} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 min-w-0">
                    <span
                      className="font-semibold truncate"
                      style={{ color: 'var(--dome-text)' }}
                      title={m.title}
                    >
                      {m.title}
                    </span>
                    <span className="text-[11px] shrink-0 font-mono" style={{ color: 'var(--dome-text-muted)' }}>
                      {list.length === 1
                        ? t('github.minimal_open_count_one', { count: list.length })
                        : t('github.minimal_open_count_other', { count: list.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                    {dueLabel && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {t('github.minimal_due', { date: dueLabel })}
                      </span>
                    )}
                    {total > 0 && (
                      <>
                        {dueLabel && <span aria-hidden>·</span>}
                        <span>
                          {m.closed_issues}/{total} {pct}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-4">
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: 'var(--dome-bg-hover)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${pct}%`, background: 'var(--dome-accent)' }}
                  />
                </div>
              </div>

              {/* Issue list */}
              <div className="px-2 py-2 mt-1 flex flex-col gap-0.5">
                {list.length === 0 ? (
                  <div
                    className="flex items-center justify-center gap-2 py-3 text-[12px]"
                    style={{ color: 'var(--dome-text-muted)' }}
                  >
                    <CheckCircle2 size={13} />
                    {t('github.minimal_no_open_tasks')}
                  </div>
                ) : (
                  list.map((issue) => <IssueRow key={issue.id} issue={issue} />)
                )}
              </div>
            </div>
          );
        })}

        {groups.orphan.length > 0 && (
          <div
            className="rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--dome-bg-hover) 60%, var(--dome-surface))',
              border: '1px dashed var(--dome-border)',
            }}
          >
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <span
                className="shrink-0 inline-flex items-center justify-center rounded-md"
                style={{
                  width: 24,
                  height: 24,
                  background: 'var(--dome-bg-hover)',
                  color: 'var(--dome-text-muted)',
                }}
              >
                <Inbox size={13} strokeWidth={2} />
              </span>
              <span
                className="font-semibold flex-1"
                style={{ color: 'var(--dome-text-secondary)' }}
              >
                {t('github.minimal_other_tasks')}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--dome-text-muted)' }}>
                {groups.orphan.length}
              </span>
            </div>
            <div className="px-2 py-2 flex flex-col gap-0.5">
              {groups.orphan.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
            </div>
          </div>
        )}

        {groups.cards.length === 0 && groups.orphan.length === 0 && (
          <div
            className="rounded-xl py-14 flex flex-col items-center justify-center gap-2 text-center"
            style={{
              background: 'var(--dome-surface)',
              border: '1px dashed var(--dome-border)',
            }}
          >
            <CheckCircle2 size={28} style={{ color: 'var(--dome-success)' }} />
            <span className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('github.minimal_all_done')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
