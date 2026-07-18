'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  File02Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGitHubStore } from '@/lib/store/useGitHubStore';
import { githubClient } from '@/lib/github/client';
import { TrackingStats, type TrackingFilter } from './TrackingStats';
import { TrackingObjectiveSection } from './TrackingObjectiveSection';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_MS = 14 * DAY_MS;

function issueDueMs(issue: GitHubIssueRow, milestones: GitHubMilestoneRow[]): number | null {
  if (issue.due_date != null) return issue.due_date;
  if (issue.milestone_number == null) return null;
  const m = milestones.find((x) => x.number === issue.milestone_number);
  return m?.due_on ?? null;
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
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const items = [
    { value: 'none', label: t('github.dash_no_objective') },
    ...milestones
      .filter((m) => m.state === 'open')
      .map((m) => ({ value: String(m.number), label: m.title })),
    { value: '__new__', label: t('github.dash_new_objective') },
  ];

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
      window.setTimeout(() => setSuccess(false), 2000);
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
      void submit();
    }
  };

  return (
    <Card className="gap-0 py-0 shadow-none">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('github.dash_create_placeholder')}
            aria-label={t('github.dash_create_label')}
            className="min-w-0 flex-1"
            autoComplete="off"
          />
          {success ? (
            <output className="inline-flex shrink-0 items-center gap-1 text-[11px] text-(--success)">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
              {t('github.dash_created')}
            </output>
          ) : null}
        </div>

        {error ? (
          <p className="flex items-center gap-1 text-[11px] text-destructive" role="alert">
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={objective}
            onValueChange={(v) => {
              if (v != null) setObjective(v);
            }}
            items={items}
          >
            <SelectTrigger className="w-auto max-w-52" aria-label={t('github.dash_objective')}>
              <SelectValue placeholder="—" />
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
            size="sm"
            onClick={() => setBodyOpen((v) => !v)}
          >
            <HugeiconsIcon icon={File02Icon} className="size-3.5" />
            {t('github.dash_notes')}
          </Button>

          <div className="ml-auto flex gap-1.5">
            <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={reset}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !title.trim()} loading={submitting}>
              {t('github.dash_create')}
            </Button>
          </div>
        </div>

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
    </Card>
  );
}

export default function TrackingDashboard({
  query = '',
  onOpenIssue,
  onOpenMilestone,
}: {
  query?: string;
  onOpenIssue: (id: string) => void;
  onOpenMilestone: (id: string) => void;
}) {
  const { t } = useTranslation();
  const selectedRepoId = useGitHubStore((s) => s.selectedRepoId);
  const milestones = useGitHubStore((s) => s.milestones);
  const allIssues = useGitHubStore((s) => s.issues);
  const loadRepoData = useGitHubStore((s) => s.loadRepoData);
  const patchLocalIssue = useGitHubStore((s) => s.patchLocalIssue);
  const [filter, setFilter] = useState<TrackingFilter>('all');

  const now = Date.now();
  const q = query.trim().toLowerCase();

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

  const sections = useMemo(() => {
    const openMilestones = milestones
      .filter((m) => m.state === 'open')
      .slice()
      .sort((a, b) => (a.due_on ?? Infinity) - (b.due_on ?? Infinity));

    const byNumber = new Map<number | 'none', GitHubIssueRow[]>();
    for (const i of listIssues) {
      const k = i.milestone_number ?? 'none';
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k)!.push(i);
    }

    const cards =
      filter === 'no_objective' || filter === 'done'
        ? []
        : openMilestones
            .map((m) => ({
              milestone: m,
              issues: (byNumber.get(m.number) ?? []).slice().sort((a, b) => b.number - a.number),
            }))
            .filter((c) => c.issues.length > 0);

    const inbox = (byNumber.get('none') ?? []).slice().sort((a, b) => b.number - a.number);

    return { cards, inbox };
  }, [milestones, listIssues, filter]);

  const toggleDone = async (issue: GitHubIssueRow) => {
    const res = await githubClient.issues.move(issue.id, {
      state: issue.state === 'open' ? 'closed' : 'open',
    });
    if (res.success && res.issue) patchLocalIssue(res.issue);
  };

  if (!selectedRepoId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('github.dash_select_repo')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-4">
      <TrackingStats
        openCount={stats.open}
        dueSoonCount={stats.dueSoon}
        noObjectiveCount={stats.noObjective}
        doneCount={stats.done}
        activeFilter={filter}
        onFilter={setFilter}
      />

      <QuickAdd
        selectedRepoId={selectedRepoId}
        milestones={milestones}
        loadRepoData={loadRepoData}
      />

      <ToggleGroup
        value={[filter]}
        onValueChange={(v) => {
          const next = v[0] as TrackingFilter | undefined;
          if (next) setFilter(next);
        }}
        variant="outline"
        size="sm"
        className="flex flex-wrap justify-start gap-1"
        aria-label={t('github.dash_filters')}
      >
        {(
          [
            ['all', t('github.dash_filter_all')],
            ['open', t('github.dash_filter_open')],
            ['due_soon', t('github.dash_filter_due_soon')],
            ['no_objective', t('github.dash_filter_no_objective')],
            ['done', t('github.dash_filter_done')],
          ] as const
        ).map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} className="px-2.5 text-xs">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-col gap-3">
        {filter !== 'no_objective' && filter !== 'done'
          ? sections.cards.map(({ milestone: m, issues: list }) => {
              const total = m.open_issues + m.closed_issues;
              const pct = total > 0 ? Math.round((m.closed_issues / total) * 100) : 0;
              return (
                <TrackingObjectiveSection
                  key={m.id}
                  title={t('github.dash_objective_title', { title: m.title })}
                  dueOn={m.due_on}
                  progressPct={pct}
                  totalLabel={t('github.dash_open_count', { count: list.length })}
                  issues={list}
                  onOpenObjective={() => onOpenMilestone(m.id)}
                  onOpenIssue={onOpenIssue}
                  onToggleDone={(issue) => void toggleDone(issue)}
                />
              );
            })
          : null}

        {(filter === 'no_objective' || filter === 'all' || filter === 'open' || filter === 'due_soon') &&
        sections.inbox.length > 0 ? (
          <TrackingObjectiveSection
            variant="inbox"
            title={t('github.dash_no_objective')}
            totalLabel={String(sections.inbox.length)}
            issues={sections.inbox}
            onOpenIssue={onOpenIssue}
            onToggleDone={(issue) => void toggleDone(issue)}
          />
        ) : null}

        {filter === 'done' ? (
          <TrackingObjectiveSection
            variant="inbox"
            title={t('github.dash_filter_done')}
            totalLabel={String(listIssues.length)}
            issues={listIssues}
            onOpenIssue={onOpenIssue}
            onToggleDone={(issue) => void toggleDone(issue)}
          />
        ) : null}

        {sections.cards.length === 0 &&
        sections.inbox.length === 0 &&
        !(filter === 'done' && listIssues.length > 0) ? (
          <Card className="border-dashed py-14 shadow-none">
            <div className="flex flex-col items-center gap-2 text-center">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-7 text-(--success)" />
              <p className="text-sm text-muted-foreground">{t('github.dash_all_clear')}</p>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
