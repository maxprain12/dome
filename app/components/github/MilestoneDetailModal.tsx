import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, Cancel01Icon, CheckmarkCircle02Icon, CircleIcon, ExternalLinkIcon, Flag02Icon, HashIcon, PencilIcon, SaveIcon, Target02Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '@/components/shared/DatePicker';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import { MarkdownBody } from '@/components/shared/MarkdownBody';
import { IssueLabelPills } from './IssueLabelPills';

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
    const matched: typeof allIssues = [];
    for (const i of allIssues) {
      if (i.milestone_number !== milestoneNumber) continue;
      if (!showClosedIssues && i.state !== 'open') continue;
      matched.push(i);
    }
    return matched.sort((a, b) => b.number - a.number);
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
  };

  const headerActions = milestone?.html_url ? (
    <a
      href={milestone.html_url}
      target="_blank"
      rel="noreferrer"
      title={t('github.open_milestone_on_github')}
      className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground"
    >
      <HugeiconsIcon icon={ExternalLinkIcon} size={15} />
    </a>
  ) : null;

  const footer = editing ? (
    <div className="flex items-center justify-end gap-2 w-full">
      <Button variant="ghost"
  onClick={() => setEditing(false)}
  disabled={saving}
  size="sm">
        {t('github.new_milestone_cancel')}
      </Button>
      <Button disabled={saving}
  onClick={() => void save()}
  size="sm">{saving ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />}
        {t('github.dash_save')}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2 w-full flex-wrap">
      <div className="flex items-center gap-2">
        {milestone?.state === 'open' ? (
          <Button variant="outline"
  disabled={saving}
  onClick={() => void setMilestoneState('closed')}
  size="sm">
            {t('github.dash_mark_done')}
          </Button>
        ) : (
          <Button variant="outline"
  disabled={saving}
  onClick={() => void setMilestoneState('open')}
  size="sm">
            {t('github.dash_reopen')}
          </Button>
        )}
      </div>
      <Button variant="secondary"
  onClick={() => setEditing(true)}
  size="sm">{<HugeiconsIcon icon={PencilIcon} size={13} />}
        {t('github.dash_edit')}
      </Button>
    </div>
  );

  return (
    <InlineDetailCard
      onClose={onClose}
      containerName="milestone-card"
      title={milestone?.title ?? t('github.dash_objective')}
      description={
        milestone
          ? t('github.dash_objective_subtitle', {
              open: milestone.open_issues,
              closed: milestone.closed_issues,
              pct: progressPct,
            })
          : undefined
      }
      icon={<HugeiconsIcon icon={Target02Icon} />}
      badges={<div className="flex flex-wrap items-center gap-1.5">{headerActions}</div>}
      footer={milestone ? footer : undefined}
      className="h-full rounded-none border-0 ring-0 md:rounded-lg md:ring-1"
    >
      {loading && !milestone ? (
        <p className="text-sm text-muted-foreground">
          {t('github.loading')}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm mb-3 flex items-center gap-1 text-destructive" role="alert">
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
          {error}
        </p>
      ) : null}

      {milestone && editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('github.new_milestone_title_label')}
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-semibold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('github.new_milestone_description_label')}
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-y text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 max-w-xs">
            <span className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1 text-muted-foreground">
              <HugeiconsIcon icon={Calendar03Icon} size={11} />
              {t('github.new_milestone_due_label')}
            </span>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder={t('github.new_milestone_due_placeholder')}
            />
          </label>
        </div>
      ) : null}

      {milestone && !editing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={Flag02Icon} size={14} />
              #{milestone.number}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: milestone.state === 'open' ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--accent)',
                color: milestone.state === 'open' ? 'var(--primary)' : 'var(--muted-foreground)',
              }}
            >
              {milestone.state === 'open' ? t('github.state_open') : t('github.state_closed')}
            </span>
            {milestone.due_on ? (
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon icon={Calendar03Icon} size={14} />
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
            <div className="h-1.5 rounded-full overflow-hidden bg-accent">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${progressPct}%`, background: 'var(--primary)' }}
              />
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('github.new_milestone_description_label')}
            </h3>
            {description.trim() ? (
              <MarkdownBody
                content={description}
                className="max-h-48 overflow-y-auto"
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">{t('github.no_description')}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('github.dash_tasks')}
              </h3>
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
                <Checkbox checked={showClosedIssues} onCheckedChange={setShowClosedIssues} />
                {t('github.dash_show_done')}
              </label>
            </div>
            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto rounded-lg p-1" style={{ border: '1px solid var(--border)' }}>
              {issues.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                  {t('github.dash_section_empty')}
                </div>
              ) : (
                issues.map((issue) => {
                  const labels = parseLabels(issue.labels);
                  return (
                    <div
                      key={issue.id}
                      className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleIssue(issue);
                        }}
                        className={
                          issue.state === 'closed'
                            ? 'mt-0.5 size-[18px] shrink-0 text-(--success)'
                            : 'mt-0.5 size-[18px] shrink-0 text-muted-foreground'
                        }
                        aria-label={issue.state === 'open' ? t('github.dash_mark_done') : t('github.dash_reopen')}
                      >
                        {issue.state === 'closed' ? (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
                        ) : (
                          <HugeiconsIcon icon={CircleIcon} className="size-3.5" />
                        )}
                      </Button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenIssue(issue.id)}
                          className="flex min-w-0 items-center gap-2 text-left"
                        >
                          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
                            <HugeiconsIcon icon={HashIcon} className="size-2.5" />
                            {issue.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{issue.title}</span>
                        </button>
                        <IssueLabelPills labels={labels} max={2} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </InlineDetailCard>
  );
}
