import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  File02Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DashboardDataTable } from '@/components/shared/dashboard/DashboardDataTable';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient } from '@/lib/github/client';

export type TrackingFilter = 'all' | 'open' | 'due_soon' | 'no_objective' | 'done';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_MS = 14 * DAY_MS;

function issueDueMs(issue: GitHubIssueRow, milestones: GitHubMilestoneRow[]): number | null {
  if (issue.due_date != null) return issue.due_date;
  if (issue.milestone_number == null) return null;
  const m = milestones.find((x) => x.number === issue.milestone_number);
  return m?.due_on ?? null;
}

function issueObjectiveLabel(
  issue: GitHubIssueRow,
  milestones: GitHubMilestoneRow[],
  noneLabel: string,
): string {
  if (issue.milestone_number == null) return noneLabel;
  const milestone = milestones.find((item) => item.number === issue.milestone_number);
  return milestone?.title?.trim() || noneLabel;
}

function formatDue(ms: number | null, locale: string, noneLabel: string): string {
  if (ms == null) return noneLabel;
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function QuickAdd({
  selectedRepoId,
  milestones,
  loadRepoData,
}: {
  selectedRepoId: string;
  milestones: GitHubMilestoneRow[];
  loadRepoData: (repoId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [objective, setObjective] = useState('none');
  const [newObjective, setNewObjective] = useState('');
  const [bodyOpen, setBodyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const items = [
    { value: 'none', label: t('github.dash_no_objective') },
    ...milestones
      .filter((m) => m.state === 'open')
      .map((m) => ({ value: String(m.number), label: m.title })),
    { value: '__new__', label: t('github.dash_new_objective') },
  ];
  const selectedObjective = items.find((item) => item.value === objective);

  const reset = () => {
    setTitle('');
    setBody('');
    setObjective('none');
    setNewObjective('');
    setBodyOpen(false);
    setError(null);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t('github.dash_create_error_title'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let milestoneNumber: number | null = null;
      if (objective === '__new__') {
        const mTitle = newObjective.trim();
        if (mTitle) {
          const created = await githubClient.milestones.create(selectedRepoId, { title: mTitle });
          const num = (created as { number?: number } | null)?.number;
          if (typeof num === 'number') milestoneNumber = num;
        }
      } else if (objective !== 'none') {
        milestoneNumber = Number(objective);
      }
      await githubClient.issues.create(selectedRepoId, {
        title: trimmed,
        body: body.trim() || undefined,
        ...(milestoneNumber != null ? { milestoneNumber } : {}),
      });
      reset();
      setSuccess(true);
      globalThis.setTimeout(() => setSuccess(false), 2000);
      await loadRepoData(selectedRepoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit().catch(() => {});
    }
  };

  return (
    <form onSubmit={(e) => { submit(e).catch(() => {}); }} className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('github.dash_create_placeholder')}
          aria-label={t('github.dash_create_label')}
          className="h-8 w-0 min-w-0 flex-1"
          autoComplete="off"
        />
        <Select
          value={objective}
          onValueChange={(v) => {
            if (v != null) setObjective(v);
          }}
          items={items}
        >
          <SelectTrigger size="sm" className="h-8 w-40 shrink-0" aria-label={t('github.dash_objective')}>
            <SelectValue>
              {selectedObjective ? selectedObjective.label : t('github.dash_no_objective')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="block truncate">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={bodyOpen ? 'secondary' : 'outline'}
          size="icon-sm"
          className="shrink-0"
          aria-label={t('github.dash_notes')}
          aria-pressed={bodyOpen}
          onClick={() => setBodyOpen((v) => !v)}
        >
          <HugeiconsIcon icon={File02Icon} className="size-3.5" />
        </Button>
        {success ? (
          <output className="inline-flex shrink-0 items-center gap-1 text-[11px] text-(--success)">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
            {t('github.dash_created')}
          </output>
        ) : (
          <Button type="submit" size="sm" className="shrink-0" disabled={submitting || !title.trim()} loading={submitting}>
            {t('github.dash_create')}
          </Button>
        )}
      </div>

      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-destructive" role="alert">
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          {error}
        </p>
      ) : null}

      {objective === '__new__' ? (
        <Field className="gap-1.5">
          <FieldLabel className="text-xs">{t('github.dash_new_objective')}</FieldLabel>
          <Input
            value={newObjective}
            onChange={(e) => setNewObjective(e.target.value)}
            placeholder={t('github.dash_new_objective_placeholder')}
            autoComplete="off"
          />
        </Field>
      ) : null}

      {bodyOpen ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('github.dash_notes_placeholder')}
          rows={3}
          className="min-h-16 resize-y"
        />
      ) : null}
    </form>
  );
}

export default function TrackingDashboard({
  query = '',
  onOpenIssue,
}: {
  query?: string;
  onOpenIssue: (id: string) => void;
  onOpenMilestone?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'es';
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const milestones = useGitHubStore((s) => s.milestones);
  const allIssues = useGitHubStore((s) => s.issues);
  const loadRepoData = useGitHubStore((s) => s.loadRepoData);
  const [filter, setFilter] = useState<TrackingFilter>('open');

  const now = Date.now();
  const q = query.trim().toLowerCase();
  const noneObjective = t('github.dash_no_objective');
  const noneDue = t('github.no_due_date');

  const issues = useMemo(() => {
    let list = allIssues;
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.number) === q.replace(/^#/, ''),
      );
    }
    return list;
  }, [allIssues, q]);

  const stats = useMemo(() => {
    const open = issues.filter((i) => i.state === 'open');
    const dueSoon = open.filter((i) => {
      const due = issueDueMs(i, milestones);
      return due != null && due >= now && due <= now + DUE_SOON_MS;
    });
    const noObjective = open.filter((i) => i.milestone_number == null);
    const done = issues.filter((i) => i.state === 'closed');
    return {
      open: open.length,
      dueSoon: dueSoon.length,
      noObjective: noObjective.length,
      done: done.length,
    };
  }, [issues, milestones, now]);

  const listIssues = useMemo(() => {
    switch (filter) {
      case 'open':
        return issues.filter((i) => i.state === 'open');
      case 'due_soon':
        return issues.filter((i) => {
          if (i.state !== 'open') return false;
          const due = issueDueMs(i, milestones);
          return due != null && due >= now && due <= now + DUE_SOON_MS;
        });
      case 'no_objective':
        return issues.filter((i) => i.state === 'open' && i.milestone_number == null);
      case 'done':
        return issues.filter((i) => i.state === 'closed');
      case 'all':
        return issues;
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  }, [filter, issues, milestones, now]);

  if (!selectedRepoId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('github.dash_select_repo')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden p-4">
      <QuickAdd
        selectedRepoId={selectedRepoId}
        milestones={milestones}
        loadRepoData={loadRepoData}
      />
      <DashboardDataTable
        tabs={[
          { id: 'open', label: t('github.dash_stat_open'), count: stats.open },
          { id: 'due_soon', label: t('github.dash_stat_due_soon'), count: stats.dueSoon },
          { id: 'no_objective', label: t('github.dash_stat_no_objective'), count: stats.noObjective },
          { id: 'done', label: t('github.dash_stat_done'), count: stats.done },
        ]}
        tab={filter === 'all' ? 'open' : filter}
        onTabChange={(next) => {
          if (next === 'open' || next === 'due_soon' || next === 'no_objective' || next === 'done') {
            setFilter(next);
          }
        }}
        columns={[
          {
            id: 'title',
            header: t('github.calendar_issue_title'),
            cell: (row) => <span className="line-clamp-2 font-medium">{row.title}</span>,
          },
          {
            id: 'objective',
            header: t('github.dash_objective'),
            className: 'w-[11rem]',
            cell: (row) => (
              <span className="line-clamp-1 text-muted-foreground">{row.objective}</span>
            ),
          },
          {
            id: 'due',
            header: t('github.calendar_due_date'),
            className: 'w-[8rem]',
            cell: (row) => <span className="tabular-nums text-muted-foreground">{row.due}</span>,
          },
          {
            id: 'status',
            header: t('dashboard.col_status'),
            className: 'w-[7rem]',
            cell: (row) => (
              <Badge variant="outline">
                {row.state === 'closed' ? t('github.state_closed') : t('github.state_open')}
              </Badge>
            ),
          },
        ]}
        rows={listIssues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          state: issue.state,
          objective: issueObjectiveLabel(issue, milestones, noneObjective),
          due: formatDue(issueDueMs(issue, milestones), locale, noneDue),
        }))}
        emptyTitle={t('github.dash_section_empty')}
        onRowClick={(row) => onOpenIssue(row.id)}
      />
    </div>
  );
}
