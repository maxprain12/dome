import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDownNarrowWideIcon, ArrowDownWideNarrowIcon, ArrowUpDownIcon, Calendar03Icon, CircleDotIcon } from '@hugeicons/core-free-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { useGitHubSortStore } from '@/lib/store/useGitHubSortStore';

/**
 * Shared GitHub sort controls — two minimal icon-only buttons (milestones + issues)
 * with DropdownMenu. State lives in useGitHubSortStore (persisted to
 * localStorage) so it survives tab switches, modal open/close and app restarts.
 *
 * Used by both the Kanban and Minimal tracker views for consistent placement.
 */
export default function GitHubSortControls() {
  const { t } = useTranslation();
  const setMilestoneSort = useGitHubSortStore((s) => s.setMilestoneSort);
  const setIssueSort = useGitHubSortStore((s) => s.setIssueSort);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={t('github.sort_columns')}
              className="!text-muted-foreground"
              size="icon-sm"
            />
          }
        >
          <HugeiconsIcon icon={ArrowUpDownIcon} size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40"><DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setMilestoneSort('due_date')}>
            <HugeiconsIcon icon={Calendar03Icon} size={13} />
            {t('github.sort_columns_due_date')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMilestoneSort('newest')}>
            <HugeiconsIcon icon={ArrowDownWideNarrowIcon} size={13} />
            {t('github.sort_columns_newest')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMilestoneSort('oldest')}>
            <HugeiconsIcon icon={ArrowDownNarrowWideIcon} size={13} />
            {t('github.sort_columns_oldest')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMilestoneSort('state')}>
            <HugeiconsIcon icon={CircleDotIcon} size={13} />
            {t('github.sort_columns_state')}
          </DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={t('github.sort_cards')}
              className="!text-muted-foreground"
              size="icon-sm"
            />
          }
        >
          <HugeiconsIcon icon={ArrowUpDownIcon} size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40"><DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setIssueSort('newest')}>
            <HugeiconsIcon icon={ArrowDownWideNarrowIcon} size={13} />
            {t('github.sort_cards_newest')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIssueSort('oldest')}>
            <HugeiconsIcon icon={ArrowDownNarrowWideIcon} size={13} />
            {t('github.sort_cards_oldest')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIssueSort('status')}>
            <HugeiconsIcon icon={CircleDotIcon} size={13} />
            {t('github.sort_cards_status')}
          </DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
