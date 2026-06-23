import { useTranslation } from 'react-i18next';
import { ArrowDownUp, ArrowDownWideNarrow, ArrowDownNarrowWide, Calendar, CircleDot } from 'lucide-react';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu, { type DomeContextMenuItem } from '@/components/ui/DomeContextMenu';
import { useGitHubSortStore } from '@/lib/store/useGitHubSortStore';

/**
 * Shared GitHub sort controls — two minimal icon-only buttons (milestones + issues)
 * with DomeContextMenu dropdowns. State lives in useGitHubSortStore (persisted to
 * localStorage) so it survives tab switches, modal open/close and app restarts.
 *
 * Used by both the Kanban and Minimal tracker views for consistent placement.
 */
export default function GitHubSortControls() {
  const { t } = useTranslation();
  const milestoneSort = useGitHubSortStore((s) => s.milestones);
  const setMilestoneSort = useGitHubSortStore((s) => s.setMilestoneSort);
  const issueSort = useGitHubSortStore((s) => s.issues);
  const setIssueSort = useGitHubSortStore((s) => s.setIssueSort);

  return (
    <>
      <DomeContextMenu
        align="start"
        trigger={
          <DomeButton
            iconOnly
            variant="ghost"
            size="sm"
            aria-label={t('github.sort_columns')}
            className="!text-[var(--tertiary-text)]"
          >
            <ArrowDownUp size={14} />
          </DomeButton>
        }
        items={[
          { label: t('github.sort_columns_due_date'), icon: <Calendar size={13} />, onClick: () => setMilestoneSort('due_date') },
          { label: t('github.sort_columns_newest'), icon: <ArrowDownWideNarrow size={13} />, onClick: () => setMilestoneSort('newest') },
          { label: t('github.sort_columns_oldest'), icon: <ArrowDownNarrowWide size={13} />, onClick: () => setMilestoneSort('oldest') },
          { separator: true, label: '', onClick: () => {} },
          { label: t('github.sort_columns_state'), icon: <CircleDot size={13} />, onClick: () => setMilestoneSort('state') },
        ] as DomeContextMenuItem[]}
      />
      <DomeContextMenu
        align="start"
        trigger={
          <DomeButton
            iconOnly
            variant="ghost"
            size="sm"
            aria-label={t('github.sort_cards')}
            className="!text-[var(--tertiary-text)]"
          >
            <ArrowDownUp size={14} />
          </DomeButton>
        }
        items={[
          { label: t('github.sort_cards_newest'), icon: <ArrowDownWideNarrow size={13} />, onClick: () => setIssueSort('newest') },
          { label: t('github.sort_cards_oldest'), icon: <ArrowDownNarrowWide size={13} />, onClick: () => setIssueSort('oldest') },
          { separator: true, label: '', onClick: () => {} },
          { label: t('github.sort_cards_status'), icon: <CircleDot size={13} />, onClick: () => setIssueSort('status') },
        ] as DomeContextMenuItem[]}
      />
    </>
  );
}