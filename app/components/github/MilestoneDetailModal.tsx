import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  Hash,
  Milestone,
  Pencil,
  Save,
  Target,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeDatePicker } from '@/components/ui/DomeDatePicker';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

type MilestoneFull = GitHubMilestoneRow & { description?: string | null };

function dueOnToInput(dueOn: number | null | undefined): string {
  if (!dueOn) return '';
  const d = new Date(dueOn);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inputToDueOn(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : t;
}

export default function MilestoneDetailModal({
  milestoneId,
  onClose,
  onOpenIssue,
}: {
  milestoneId: string;
  onClose: () => void;
  onOpenIssue: (issueId: string) => void;
}) {
  const { t } = useTranslation();
  const allIssues = useGitHubStore((s) => s.issues);
  const summary = useGitHubStore((s) => s.milestones.find((m) => m.id === milestoneId));
  const syncNow = useGitHubStore((s) => s.syncNow);

  const [full, setFull] = useState<MilestoneFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosedIssues, setShowClosedIssues] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const loadFull = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await githubClient.milestones.get(milestoneId);
      if (!res.success || !res.milestone) {
        throw new Error(res.error ?? t('github.milestone_detail_load_error'));
      }
      setFull(res.milestone);
      setTitle(res.milestone.title);
      setDescription(res.milestone.description ?? '');
      setDueDate(dueOnToInput(res.milestone.due_on));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [milestoneId, t]);

  useEffect(() => {
    void loadFull();
  }, [loadFull]);

  const milestone = full ?? summary ?? null;
  const milestoneNumber = milestone?.number;

  const issues = useMemo(() => {
    if (milestoneNumber == null) return [];
    return allIssues
      .filter((i) => i.milestone_number === milestoneNumber)
      .filter((i) => showClosedIssues || i.state === 'open')
      .sort((a, b) => b.number - a.number);
  }, [allIssues, milestoneNumber, showClosedIssues]);

  const totalIssues = (milestone?.open_issues ?? 0) + (milestone?.closed_issues ?? 0);
  const progressPct =
    totalIssues > 0 ? Math.round(((milestone?.closed_issues ?? 0) / totalIssues) * 100) : 0;

  const save = async () => {
    if (!milestone) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('github.new_milestone_error_title'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await githubClient.milestones.update(milestone.id, {
        title: trimmedTitle,
        description: description.trim() || null,
        dueOn: inputToDueOn(dueDate),
      });
      if (!res.success) throw new Error(res.error ?? t('github.milestone_detail_save_error'));
      setEditing(false);
      await loadFull();
      void syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setMilestoneState = async (state: 'open' | 'closed') => {
    if (!milestone) return;
    setSaving(true);
    setError(null);
    try {
      const res = await githubClient.milestones.update(milestone.id, { state });
      if (!res.success) throw new Error(res.error ?? t('github.milestone_detail_save_error'));
      await loadFull();
      void syncNow();
      if (state === 'closed') onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleIssue = async (issue: GitHubIssueRow) => {
    await githubClient.issues.move(issue.id, {
      state: issue.state === 'open' ? 'closed' : 'open',
    });
    void syncNow();
  };

  const headerActions = milestone?.html_url ? (
    <a
      href={milestone.html_url}
      target="_blank"
      rel="noreferrer"
      title={t('github.open_milestone_on_github')}
      className="inline-flex items-center justify-center rounded-md p-1.5"
      style={{ color: 'var(--dome-text-muted)' }}
    >
      <ExternalLink size={15} />
    </a>
  ) : null;

  const footer = editing ? (
    <div className="flex items-center justify-end gap-2 w-full">
      <DomeButton variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
        {t('github.new_milestone_cancel')}
      </DomeButton>
      <DomeButton variant="primary" size="sm" loading={saving} onClick={() => void save()} leftIcon={<Save size={13} />}>
        {t('github.save_sync')}
      </DomeButton>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2 w-full flex-wrap">
      <div className="flex items-center gap-2">
        {milestone?.state === 'open' ? (
          <DomeButton
            variant="outline"
            size="sm"
            loading={saving}
            onClick={() => void setMilestoneState('closed')}
          >
            {t('github.milestone_detail_close')}
          </DomeButton>
        ) : (
          <DomeButton
            variant="outline"
            size="sm"
            loading={saving}
            onClick={() => void setMilestoneState('open')}
          >
            {t('github.milestone_detail_reopen')}
          </DomeButton>
        )}
      </div>
      <DomeButton variant="secondary" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil size={13} />}>
        {t('github.milestone_detail_edit')}
      </DomeButton>
    </div>
  );

  return (
    <DomeModal
      open
      onClose={onClose}
      size="lg"
      title={milestone?.title ?? t('github.milestone')}
      subtitle={
        milestone
          ? t('github.milestone_detail_subtitle', {
              open: milestone.open_issues,
              closed: milestone.closed_issues,
              pct: progressPct,
            })
          : undefined
      }
      headerIcon={
        <span
          className="inline-flex items-center justify-center rounded-md"
          style={{
            width: 28,
            height: 28,
            background: 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-bg))',
            color: 'var(--dome-accent)',
          }}
        >
          <Target size={14} />
        </span>
      }
      headerActions={headerActions}
      footer={milestone ? footer : undefined}
    >
      {loading && !milestone ? (
        <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {t('github.loading')}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm mb-3 flex items-center gap-1" style={{ color: 'var(--dome-error)' }} role="alert">
          <X size={14} />
          {error}
        </p>
      ) : null}

      {milestone && editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('github.new_milestone_title_label')}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-semibold rounded-md px-2.5 py-1.5 outline-none"
              style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
              {t('github.new_milestone_description_label')}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="rounded-md px-2.5 py-1.5 text-sm outline-none resize-y"
              style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
            />
          </label>
          <label className="flex flex-col gap-1.5 max-w-xs">
            <span className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--dome-text-muted)' }}>
              <Calendar size={11} />
              {t('github.new_milestone_due_label')}
            </span>
            <DomeDatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder={t('github.new_milestone_due_placeholder')}
            />
          </label>
        </div>
      ) : null}

      {milestone && !editing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            <span className="inline-flex items-center gap-1">
              <Milestone size={14} />
              #{milestone.number}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: milestone.state === 'open' ? 'color-mix(in srgb, var(--dome-accent) 15%, transparent)' : 'var(--dome-bg-hover)',
                color: milestone.state === 'open' ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
              }}
            >
              {milestone.state === 'open' ? t('github.state_open') : t('github.state_closed')}
            </span>
            {milestone.due_on ? (
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} />
                {t('github.due_on', {
                  date: new Date(milestone.due_on).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }),
                })}
              </span>
            ) : (
              <span>{t('github.no_due_date')}</span>
            )}
          </div>

          <div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--dome-bg-hover)' }}>
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${progressPct}%`, background: 'var(--dome-accent)' }}
              />
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
              {t('github.new_milestone_description_label')}
            </h3>
            <p className="text-sm whitespace-pre-wrap" style={{ color: description.trim() ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
              {description.trim() || t('github.no_description')}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('github.milestone_detail_issues')}
              </h3>
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--dome-text-muted)' }}>
                <input
                  type="checkbox"
                  checked={showClosedIssues}
                  onChange={(e) => setShowClosedIssues(e.target.checked)}
                />
                {t('github.milestone_detail_show_closed')}
              </label>
            </div>
            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto rounded-lg p-1" style={{ border: '1px solid var(--dome-border)' }}>
              {issues.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                  <CheckCircle2 size={14} />
                  {t('github.minimal_no_open_tasks')}
                </div>
              ) : (
                issues.map((issue) => {
                  const labels = parseLabels(issue.labels).slice(0, 2);
                  return (
                    <div
                      key={issue.id}
                      className="group flex items-start gap-2 w-full px-2 py-1.5 rounded-md"
                      style={{ color: 'var(--dome-text)' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'var(--dome-bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleIssue(issue);
                        }}
                        className="shrink-0 mt-0.5 border-0 bg-transparent p-0"
                        style={{ color: issue.state === 'closed' ? 'var(--dome-success)' : 'var(--dome-text-muted)' }}
                        aria-label={issue.state === 'open' ? t('github.close_issue') : t('github.reopen_issue')}
                      >
                        {issue.state === 'closed' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenIssue(issue.id)}
                        className="flex-1 min-w-0 text-left border-0 bg-transparent p-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-mono shrink-0 inline-flex items-center gap-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                            <Hash size={11} />
                            {issue.number}
                          </span>
                          <span className="text-sm truncate">{issue.title}</span>
                        </div>
                        {labels.length > 0 ? (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {labels.map((label) => (
                              <span
                                key={label}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                  background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)',
                                  color: 'var(--dome-accent)',
                                }}
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DomeModal>
  );
}
