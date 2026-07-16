import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, CircleIcon, HashIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { parseLabels } from '@/lib/github/client';
import { IssueLabelPills } from './IssueLabelPills';

export function TrackingTaskRow({
  issue,
  onOpen,
  onToggleDone,
}: {
  issue: GitHubIssueRow;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const { t } = useTranslation();
  const labels = parseLabels(issue.labels);
  const done = issue.state === 'closed';

  return (
    <div className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={
          done
            ? 'mt-0.5 size-[18px] shrink-0 text-(--success)'
            : 'mt-0.5 size-[18px] shrink-0 text-muted-foreground hover:text-(--success)'
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        title={done ? t('github.dash_reopen') : t('github.dash_mark_done')}
        aria-label={done ? t('github.dash_reopen') : t('github.dash_mark_done')}
      >
        <HugeiconsIcon icon={done ? CheckmarkCircle02Icon : CircleIcon} className="size-3.5" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2 text-left">
          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground">
            <HugeiconsIcon icon={HashIcon} className="size-2.5" />
            {issue.number}
          </span>
          <span
            className={
              done
                ? 'min-w-0 flex-1 truncate text-sm text-muted-foreground line-through'
                : 'min-w-0 flex-1 truncate text-sm text-foreground'
            }
          >
            {issue.title}
          </span>
        </button>
        <IssueLabelPills labels={labels} />
      </div>
    </div>
  );
}
