import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, InboxIcon, PanelRightOpenIcon, Target02Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { TrackingTaskRow } from './TrackingTaskRow';

const PAGE_SIZE = 20;

export function TrackingObjectiveSection({
  title,
  dueOn,
  progressPct,
  totalLabel,
  issues,
  variant = 'objective',
  onOpenObjective,
  onOpenIssue,
  onToggleDone,
}: {
  title: string;
  dueOn?: number | null;
  progressPct?: number;
  totalLabel?: string;
  issues: GitHubIssueRow[];
  variant?: 'objective' | 'inbox';
  onOpenObjective?: () => void;
  onOpenIssue: (id: string) => void;
  onToggleDone: (issue: GitHubIssueRow) => void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = issues.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const dueLabel =
    dueOn != null
      ? new Date(dueOn).toLocaleDateString(undefined, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : null;

  return (
    <Card
      className={
        variant === 'inbox'
          ? 'gap-0 border-dashed py-0 shadow-none'
          : 'gap-0 overflow-hidden py-0 shadow-none'
      }
    >
      <CardHeader className="flex-row items-start gap-3 gap-y-0 px-4 py-3">
        <span
          className={
            variant === 'inbox'
              ? 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'
              : 'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'
          }
        >
          <HugeiconsIcon
            icon={variant === 'inbox' ? InboxIcon : Target02Icon}
            className="size-3.5"
            strokeWidth={2}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle
              className={
                variant === 'inbox'
                  ? 'min-w-0 flex-1 truncate text-sm text-muted-foreground'
                  : 'min-w-0 flex-1 truncate text-sm'
              }
            >
              {title}
            </CardTitle>
            {totalLabel ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{totalLabel}</span>
            ) : null}
            {onOpenObjective ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onOpenObjective}
                title={t('github.dash_open_objective')}
                aria-label={t('github.dash_open_objective')}
              >
                <HugeiconsIcon icon={PanelRightOpenIcon} className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {dueLabel ? (
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon icon={Calendar03Icon} className="size-2.5" />
                {t('github.dash_due', { date: dueLabel })}
              </span>
            ) : null}
            {progressPct != null ? <span>{progressPct}%</span> : null}
          </div>
        </div>
      </CardHeader>

      {progressPct != null ? (
        <div className="px-4 pb-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full w-full origin-left rounded-full bg-primary transition-transform [transition-duration:var(--duration-ui)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${progressPct / 100})` }}
            />
          </div>
        </div>
      ) : null}

      <CardContent className="flex flex-col gap-0.5 px-2 pb-2 pt-0">
        {slice.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">{t('github.dash_section_empty')}</p>
        ) : (
          slice.map((issue) => (
            <TrackingTaskRow
              key={issue.id}
              issue={issue}
              onOpen={() => onOpenIssue(issue.id)}
              onToggleDone={() => onToggleDone(issue)}
            />
          ))
        )}
      </CardContent>

      {issues.length > PAGE_SIZE ? (
        <div className="flex shrink-0 items-center justify-between gap-1 border-t px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t('github.dash_page_prev')}
          </Button>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {t('github.dash_page_status', {
              page: safePage + 1,
              pages: pageCount,
              shown: slice.length,
              total: issues.length,
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            {t('github.dash_page_next')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
